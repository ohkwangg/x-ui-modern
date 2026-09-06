const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({crypto: crypto.webcrypto, URLSearchParams, Base64:{encode:value=>Buffer.from(value).toString('base64')}, Vue:{component(){}}, location:{hostname:'localhost'}, console});
for (const file of ['util/utils.js','model/xray.js','model/models.js','model/inbound-editor.js']) vm.runInContext(fs.readFileSync(path.join(root,'web/assets/js',file),'utf8'),context);
const editor = vm.runInContext('InboundEditor',context);
const core = process.env.XRAY_BINARY;
test('all 12 registered inbound protocol names are exposed with Chinese help',()=>{
    assert.deepEqual(Object.keys(editor.protocols).sort(), ['dokodemo-door','http','hysteria','mixed','shadowsocks','socks','trojan','tun','tunnel','vless','vmess','wireguard']);
    for(const spec of Object.values(editor.protocols)) for(const field of spec.fields) assert.ok(field.help.length>5);
});
test('unknown protocol, stream, security and sniffing fields survive DB read/edit serialization',()=>{
    for (const protocol of Object.keys(editor.protocols)) {
        const config = editor.create(protocol);
        config.settings.futureField={nested:[1,2,3]};
        config.streamSettings.futureTransport={test:'keep'};
        config.sniffing.domainsExcluded=['example.com'];
        context.fixture=JSON.parse(JSON.stringify(config));
        const actual=vm.runInContext(`new DBInbound({protocol:fixture.protocol,port:fixture.port,listen:fixture.listen,settings:JSON.stringify(fixture.settings),streamSettings:JSON.stringify(fixture.streamSettings),sniffing:JSON.stringify(fixture.sniffing)}).toInbound().toJson()`,context);
        assert.deepEqual(JSON.parse(JSON.stringify(actual.settings)),JSON.parse(JSON.stringify(config.settings)));
        assert.deepEqual(JSON.parse(JSON.stringify(actual.streamSettings)),JSON.parse(JSON.stringify(config.streamSettings)));
    }
});
test('removed transports and wrong Hysteria combinations fail before save',()=>{
    for(const network of ['http','h2','h3','quic']) { const c=editor.create();c.streamSettings.network=network;assert.throws(()=>editor.validate(c)); }
    const c=editor.create('hysteria');c.streamSettings.security='none';assert.throws(()=>editor.validate(c));
});
test('cryptographic UUIDs have RFC 4122 version and variant bits',()=>{
    for(let i=0;i<100;i++) assert.match(vm.runInContext('RandomUtil.randomUUID()',context),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('REALITY share links use public keys and preserve Vision and XHTTP parameters',()=>{
    const db={protocol:'vless',address:'2001:db8::1',port:443,remark:'测试',sharePublicKey:'public-only',settings:JSON.stringify({clients:[{id:'test-id',flow:'xtls-rprx-vision'}],decryption:'none'}),streamSettings:JSON.stringify({network:'raw',security:'reality',realitySettings:{privateKey:'never-export',serverNames:['example.com'],shortIds:['abcd']}})};
    const link=editor.shareLink(db);assert.ok(!link.includes('never-export'));
    const url=new URL(link);assert.equal(url.searchParams.get('pbk'),'public-only');assert.equal(url.searchParams.get('flow'),'xtls-rprx-vision');assert.equal(url.searchParams.get('type'),'tcp');
    db.streamSettings=JSON.stringify({network:'xhttp',security:'tls',xhttpSettings:{path:'/test',mode:'auto'}});
    const xhttp=new URL(editor.shareLink(db));assert.equal(xhttp.searchParams.get('path'),'/test');assert.equal(xhttp.searchParams.get('type'),'xhttp');
});
test('generated configurations pass the pinned real Xray core', {skip:!core}, ()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xui-core-test-'));
    try {
        const cert=JSON.parse(cp.execFileSync(core,['tls','cert','--domain=localhost'],{encoding:'utf8'}));
        const key=cp.execFileSync(core,['x25519'],{encoding:'utf8'}).match(/PrivateKey:\s*(\S+)/)[1];
        const wgKey=crypto.randomBytes(32).toString('base64');
        function check(name, config) {
            config=JSON.parse(JSON.stringify(config));
            if(!config.listen) delete config.listen;
            if(config.protocol==='tun') delete config.port;
            config.tag=name;
            const file=path.join(dir,name+'.json');
            fs.writeFileSync(file,JSON.stringify({log:{loglevel:'warning'},inbounds:[config],outbounds:[{protocol:'freedom'}]}));
            const result=cp.spawnSync(core,['convert','pb','-o',path.join(dir,'validated.pb'),file],{encoding:'utf8',timeout:15000});
            assert.equal(result.status,0,name+': '+result.stdout+result.stderr);
            if(config.protocol!=='tun') {
                const loaded=cp.spawnSync(core,['run','-test','-config',file],{encoding:'utf8',timeout:15000});
                assert.equal(loaded.status,0,name+': '+loaded.stdout+loaded.stderr);
            }
        }
        for(const protocol of Object.keys(editor.protocols)) {
            const config=editor.create(protocol);
            if(config.streamSettings.security==='tls') config.streamSettings.tlsSettings.certificates=[cert];
            if(protocol==='wireguard') config.settings.secretKey=wgKey;
            check(protocol,config);
        }
        for(const network of Object.keys(editor.transports)) {
            const config=editor.create('vless');
            config.streamSettings={network,security:network==='hysteria'?'tls':'none',[editor.transports[network].key]:network==='hysteria'?{version:2}:{}};
            if(network==='hysteria') config.streamSettings.tlsSettings={certificates:[cert]};
            check('transport-'+network,config);
        }
        const reality=editor.create('vless');
        reality.settings.clients[0].flow='xtls-rprx-vision';
        reality.streamSettings={network:'raw',security:'reality',realitySettings:{target:'127.0.0.1:443',serverNames:['localhost'],privateKey:key,shortIds:['0123456789abcdef']}};
        check('reality-vision',reality);
        for(const [method,size] of [['2022-blake3-aes-128-gcm',16],['2022-blake3-aes-256-gcm',32],['2022-blake3-chacha20-poly1305',32]]) {
            const config=editor.create('shadowsocks');config.settings.method=method;config.settings.password=crypto.randomBytes(size).toString('base64');check(method,config);
        }
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
