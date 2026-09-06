// Xray inbound configuration stays as plain JSON: unknown fields survive editing.
const InboundEditor = (() => {
    const copy = value => JSON.parse(JSON.stringify(value));
    const field = (key, label, help, type = 'text', options = null) => ({key, label, help, type, options});
    const f = field;
    const clients = f('clients', '用户列表', '每项是一位客户端。id 是 UUID；password/auth 是连接密码；email 是统计标识；level 对应策略等级。可在高级 JSON 中添加更多用户。', 'json');
    const fallbacks = f('fallbacks', '回落规则', '将未通过代理认证的连接转交给本机网站。数组中 dest 为目标端口或地址，name/alpn/path 为匹配条件，xver 为 PROXY protocol 版本。', 'json');
    const level = f('userLevel', '用户等级', '引用 Xray policy.levels 中同编号的超时、限速和统计策略。0 为默认等级。', 'number');
    const network = f('network', '代理流量类型', '决定该入站转发 TCP、UDP 或两者；这不是底层传输方式。', 'select', ['tcp', 'udp', 'tcp,udp']);
    const accounts = f('accounts', '账号列表', '每项包含 user（用户名）和 pass（密码）。SOCKS/mixed 还需要将认证方式设为 password。空列表表示没有账号。', 'json');
    const protocols = {
        vmess: {help: 'VMess 加密代理。客户端 UUID 必须与服务器一致；现代客户端使用 alterId=0。', defaults: () => ({clients: [{id: RandomUtil.randomUUID(), alterId: 0}]}), fields: [clients, f('disableInsecureEncryption', '禁止不安全加密', '拒绝使用不安全加密方式的旧客户端。', 'bool')]},
        vless: {help: 'VLESS 轻量代理，通常搭配 TLS 或 REALITY；Vision flow 使用 xtls-rprx-vision。', defaults: () => ({clients: [{id: RandomUtil.randomUUID(), flow: ''}], decryption: 'none'}), fields: [clients, f('decryption', '解密方式', '普通 VLESS 填 none；VLESS Encryption 使用 xray vlessenc 生成的服务端配置。不要填写客户端 encryption 值。'), fallbacks]},
        trojan: {help: 'Trojan 使用密码认证，通常需要 TLS 证书，也可按核心支持情况使用 REALITY。', defaults: () => ({clients: [{password: RandomUtil.randomSeq(24)}]}), fields: [clients, fallbacks]},
        shadowsocks: {help: 'Shadowsocks 加密代理，支持传统 AEAD 和 Shadowsocks 2022。2022 密码必须是正确长度的 Base64 密钥。', defaults: () => ({method: 'aes-128-gcm', password: RandomUtil.randomSeq(24), network: 'tcp,udp'}), fields: [f('method', '加密方法', '2022 AES-128 使用 16 字节密钥；AES-256/ChaCha20 使用 32 字节密钥。可用 xray uuid 或系统随机源生成后按要求编码。', 'select', ['aes-128-gcm', 'aes-256-gcm', 'chacha20-poly1305', '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305']), f('password', '密码 / 密钥', '客户端必须使用相同密码；2022 必须使用 Base64 编码的随机字节。', 'password'), network, clients]},
        'dokodemo-door': {help: '透明代理或固定目标端口转发。followRedirect 需要系统防火墙重定向规则配合。', defaults: () => ({address: '127.0.0.1', port: 80, network: 'tcp', followRedirect: false}), fields: [f('address', '目标地址', '收到连接后转发到的 IP 或域名。'), f('port', '目标端口', '转发目标的端口；不是本入站监听端口。', 'number'), network, f('followRedirect', '读取原始目标', '从系统透明代理重定向中获取原始目的地址，需先配置防火墙。', 'bool'), level]},
        socks: {help: 'SOCKS 代理，可供浏览器或应用直接连接。监听公网时应启用密码认证。', defaults: () => ({auth: 'password', accounts: [{user: 'user', pass: RandomUtil.randomSeq(24)}], udp: true}), fields: [f('auth', '认证方式', 'password 要求用户名和密码；noauth 允许任何可访问监听端口的人连接。', 'select', ['password', 'noauth']), accounts, f('udp', 'UDP 转发', '允许 SOCKS5 UDP ASSOCIATE；客户端与网络也需支持 UDP。', 'bool'), f('ip', 'UDP 公布地址', '告诉客户端发送 UDP 数据的位置。远程使用时填写客户端可访问的服务器 IP。'), level]},
        http: {help: 'HTTP CONNECT 正向代理，供支持 HTTP 代理的应用使用；它不是网站服务器。', defaults: () => ({accounts: [{user: 'user', pass: RandomUtil.randomSeq(24)}]}), fields: [accounts, f('allowTransparent', '透明 HTTP', '允许没有显式代理格式的 HTTP 请求。仅在明确需要透明代理时开启。', 'bool'), level]},
        wireguard: {help: 'WireGuard UDP 隧道。需服务端私钥和客户端公钥；与 TLS、REALITY 及通用传输不组合。', defaults: () => ({secretKey: '', address: ['10.0.0.1/32'], peers: [], mtu: 1420}), fields: [f('secretKey', '服务端私钥', '使用 xray wg 生成密钥对，私钥仅留在服务器；客户端配置对应公钥。', 'password'), f('address', '隧道地址', 'JSON 字符串数组，例如 ["10.0.0.1/32"]，避免与现有网络冲突。', 'json'), f('peers', '对端列表', 'JSON 数组，每项含 publicKey、allowedIPs，可选 preSharedKey、endpoint、keepAlive、email、level。allowedIPs 限定该对端的隧道地址。', 'json'), f('mtu', 'MTU', '隧道最大包长，默认 1420；遇到大包传输问题时可适当调低。', 'number'), f('noKernelTun', '用户态网络栈', '开启后使用用户态实现，避免依赖内核 TUN。具体支持由运行系统决定。', 'bool')]},
        hysteria: {help: 'Hysteria 2（核心协议名 hysteria）。使用 UDP/QUIC，必须配套 Hysteria 传输、version=2 和 TLS。', defaults: () => ({version: 2, clients: [{auth: RandomUtil.randomSeq(24)}]}), fields: [f('version', '协议版本', '当前仅支持 2。', 'number'), clients]},
        tun: {help: 'TUN 虚拟网卡入站，不监听 TCP/UDP 端口。需要系统 TUN 支持及相应权限；自动路由会改变服务器网络。', defaults: () => ({name: 'xray0', mtu: 1500, gateway: ['172.19.0.1/30']}), fields: [f('name', '网卡名称', '操作系统中创建的虚拟网卡名称，同一服务器上应唯一。'), f('mtu', 'MTU', '虚拟网卡最大包长，默认 1500。', 'number'), f('gateway', '网关地址', '虚拟网卡 CIDR 地址数组，例如 ["172.19.0.1/30"]。', 'json'), f('dns', 'DNS 地址', '分配给虚拟网卡的 DNS 服务器地址数组。', 'json'), f('autoSystemRoutingTable', '自动系统路由', '要自动加入路由表的 CIDR 数组。使用默认路由可能影响 SSH 和面板访问；请按实际网络设置。默认不启用。', 'json'), f('autoOutboundsInterface', '出站网卡', '自动路由时指定真正的出口网卡；auto 为自动选择。'), level]},
    };
    protocols.mixed = {...protocols.socks, help: '同一端口同时接受 SOCKS 和 HTTP 代理请求。认证与 UDP 选项沿用 SOCKS。'};
    protocols.tunnel = {...protocols['dokodemo-door'], help: 'dokodemo-door 的新别名，用于固定目标转发或透明代理。'};
    const userCommon = [f('email', '用户标识', '用于日志和统计的唯一标识，不会发送邮件。'), f('level', '策略等级', '对应 policy.levels 中的等级，0 为默认策略。', 'number')];
    for (const name of ['vmess', 'vless', 'trojan', 'hysteria']) {
        const key = name === 'trojan' ? 'password' : name === 'hysteria' ? 'auth' : 'id';
        const children = [f(key, key === 'id' ? 'UUID' : '连接密码', '客户端必须填写相同值；请勿与无关人员分享。', key === 'id' ? 'text' : 'password'), ...userCommon];
        if (name === 'vless') children.push(f('flow', '流控', 'Vision 用于 VLESS + TCP + TLS/REALITY；其他传输通常留空。', 'select', ['', 'xtls-rprx-vision']));
        if (name === 'vmess') children.push(f('alterId', '兼容 ID', '现代 VMess 使用 0。大于 0 的旧模式已不受新版核心支持。', 'number'));
        protocols[name].fields = protocols[name].fields.map(item => item === clients ? {...clients, type: 'list', children, create: () => protocols[name].defaults().clients[0]} : item);
    }
    for (const name of ['socks', 'mixed', 'http']) protocols[name].fields = protocols[name].fields.map(item => item === accounts ? {...accounts, type:'list', children:[f('user','用户名','客户端代理认证用户名。'), f('pass','密码','客户端代理认证密码。','password')], create:()=>({user:'user',pass:RandomUtil.randomSeq(24)})} : item);
    const transports = {
        raw: {key: 'rawSettings', help: '原生 TCP 传输，原名 tcp。适合 VLESS + REALITY / Vision。', fields: [f('acceptProxyProtocol', '接收 PROXY protocol', '仅当前置负载均衡器发送 PROXY protocol 时开启，否则普通连接会失败。', 'bool')]},
        xhttp: {key: 'xhttpSettings', help: 'XHTTP，可通过 HTTP/2 或 HTTP/3 传输。客户端路径和模式需兼容。', fields: [f('host', 'Host', '请求的域名；留空时不限定 Host。'), f('path', '路径', '客户端与服务器必须一致，例如 /proxy。'), f('mode', '模式', 'auto 自动协商；其余模式需与客户端及反向代理能力匹配。', 'select', ['auto', 'packet-up', 'stream-up', 'stream-one']), f('extra', '扩展参数', 'XHTTP 的高级配置对象，如 xmux、请求大小和间隔。参数含义参见 Xray 官方文档。', 'json')]},
        ws: {key: 'wsSettings', help: 'WebSocket 传输，常用于反向代理或 CDN。', fields: [f('path', '路径', 'WebSocket 请求路径，客户端和反向代理配置必须一致。'), f('host', 'Host', 'HTTP 请求的域名。'), f('acceptProxyProtocol', '接收 PROXY protocol', '仅当前置代理明确发送 PROXY protocol 时开启。', 'bool')]},
        httpupgrade: {key: 'httpupgradeSettings', help: 'HTTP Upgrade 传输，需要反向代理允许 Upgrade。', fields: [f('path', '路径', '客户端 HTTP Upgrade 请求路径。'), f('host', 'Host', '请求域名，应与反向代理配置匹配。')]},
        grpc: {key: 'grpcSettings', help: 'gRPC 基于 HTTP/2；Xray 当前建议新配置优先考虑 XHTTP。', fields: [f('serviceName', '服务名', '客户端和服务器的 gRPC 服务名称必须一致。')]},
        kcp: {key: 'kcpSettings', help: 'mKCP 基于 UDP，可提高丢包网络下的传输能力，但会增加流量消耗。', fields: [f('seed', '种子', 'mKCP 加密种子，客户端与服务器必须一致。'), f('mtu', 'MTU', 'UDP 包大小，默认由核心选择。', 'number'), f('uplinkCapacity', '上行容量', '预估上行带宽，单位 MB/s。', 'number'), f('downlinkCapacity', '下行容量', '预估下行带宽，单位 MB/s。', 'number'), f('congestion', '拥塞控制', '根据网络拥塞调整发送速度。', 'bool')]},
        hysteria: {key: 'hysteriaSettings', help: 'Hysteria 2 的 QUIC 传输，必须使用 TLS；与已移除的旧 quic 传输不同。', fields: [f('version', '版本', '必须为 2。', 'number'), f('udpIdleTimeout', 'UDP 空闲超时', '无数据时关闭 UDP 会话的秒数；有效范围 2–600，0 使用默认值。', 'number'), f('masquerade', '伪装服务', '未认证请求的响应配置对象，支持 type=file/proxy/string 等，详见核心文档。', 'json')]},
    };
    transports.tcp = {...transports.raw, key: 'tcpSettings'};
    transports.splithttp = {...transports.xhttp, key: 'splithttpSettings'};
    transports.mkcp = transports.kcp;
    transports.websocket = transports.ws;
    const security = {
        tls: [f('serverName', '服务器名称', 'TLS 域名，用于证书及握手配置。证书须包含客户端连接所用域名。'), f('alpn', 'ALPN', '允许的应用协议数组，如 ["h2","http/1.1"]；Hysteria 通常使用 ["h3"]。', 'json'), f('certificates', '证书列表', '每项含 certificateFile（证书完整路径）和 keyFile（私钥完整路径）。路径在服务器上，不是你的电脑上。也支持 certificate/key 的 PEM 行数组。', 'json'), f('minVersion', '最低 TLS 版本', '限制最低版本，通常使用 1.2 或 1.3。', 'select', ['1.2', '1.3'])],
        reality: [f('target', '目标网站', 'REALITY 握手回落目标，填写支持 TLS 1.3 的域名:端口，例如 example.com:443。必须从服务器可访问。'), f('serverNames', '允许的 SNI', '目标网站证书覆盖的域名数组；客户端 SNI 必须匹配。', 'json'), f('privateKey', '私钥', '执行 xray x25519 生成。这里只填写 PrivateKey，对应公钥交给客户端。', 'password'), f('shortIds', 'Short ID 列表', '十六进制字符串数组，每项偶数长度且最多 16 个字符，客户端选择其中一个。', 'json'), f('xver', '回落 PROXY 版本', '0 为关闭。仅目标服务支持 PROXY protocol 时选 1 或 2。', 'number'), f('maxTimeDiff', '时间容差', '允许客户端与服务器的最大时钟差，单位毫秒；0 不限制。', 'number'), f('show', '调试输出', '输出 REALITY 调试信息，排障结束后建议关闭。', 'bool')],
    };
    const sniffing = [f('enabled', '启用嗅探', '从连接内容识别目标域名，帮助路由规则正确匹配。', 'bool'), f('destOverride', '识别协议', '字符串数组，支持 http、tls、quic、fakedns 等。', 'json'), f('routeOnly', '仅用于路由', '只用嗅探结果选择出站，保留原始目的地址。', 'bool'), f('metadataOnly', '仅嗅探元数据', '不读取连接内容，降低开销，但可识别的信息会减少。', 'bool'), f('domainsExcluded', '排除域名', '这些域名不使用嗅探覆盖，填写字符串数组。', 'json')];
    protocols.wireguard.fields = protocols.wireguard.fields.map(item => item.key==='peers' ? {...item,type:'list',create:()=>({publicKey:'',allowedIPs:['10.0.0.2/32']}),children:[f('publicKey','客户端公钥','填客户端密钥对的公钥，不要填私钥。'),f('allowedIPs','允许的地址','客户端在隧道内使用的地址数组，如 ["10.0.0.2/32"]。','json'),f('preSharedKey','预共享密钥','可选的额外对称密钥，双方保持一致。','password'),f('endpoint','对端地址','可选，格式为主机:端口；漫游客户端通常留空。'),f('keepAlive','保活间隔','定期发送保活包的秒数，0 关闭；NAT 后常用 25。','number')]} : item);
    security.tls = security.tls.map(item => item.key==='certificates' ? {...item,type:'list',create:()=>({certificateFile:'',keyFile:''}),children:[f('certificateFile','证书路径','服务器上的 PEM 证书完整路径，应包含完整证书链。'),f('keyFile','私钥路径','服务器上的 PEM 私钥完整路径。确保 Xray 进程有读取权限。')]} : item);
    function create(protocol = 'vmess') {
        const result = {protocol, listen: '', port: RandomUtil.randomIntRange(10000, 60000), settings: protocols[protocol].defaults(), streamSettings: {}, sniffing: {enabled: true, destOverride: ['http', 'tls'], routeOnly: true}};
        if (!['wireguard', 'tun'].includes(protocol)) result.streamSettings = {network: 'raw', security: 'none', rawSettings:{}};
        if (protocol === 'trojan') result.streamSettings = {network: 'raw', security: 'tls', tlsSettings: {certificates: []}};
        if (protocol === 'hysteria') result.streamSettings = {network: 'hysteria', security: 'tls', hysteriaSettings: {version: 2}, tlsSettings: {alpn: ['h3'], certificates: []}};
        if (protocol === 'tun') result.port = 0;
        return result;
    }
    function validate(config) {
        if (!protocols[config.protocol]) throw Error('请选择受支持的入站协议');
        if (config.protocol !== 'tun' && (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)) throw Error('监听端口必须为 1–65535 的整数');
        for (const key of ['settings', 'streamSettings', 'sniffing']) if (!config[key] || Array.isArray(config[key]) || typeof config[key] !== 'object') throw Error(key + ' 必须是 JSON 对象');
        const stream = config.streamSettings;
        if (['http', 'h2', 'h3', 'quic'].includes(stream.network)) throw Error('旧 HTTP/QUIC 传输已移除，请迁移到 XHTTP；原配置尚未保存');
        if (stream.security === 'xtls') throw Error('旧 XTLS 已移除，请使用 TLS/REALITY，并将 VLESS flow 设为 xtls-rprx-vision');
        if (config.protocol === 'hysteria' && (config.settings.version !== 2 || stream.network !== 'hysteria' || stream.security !== 'tls' || (stream.hysteriaSettings || {}).version !== 2)) throw Error('Hysteria 要求协议和传输 version=2、network=hysteria、security=tls');
        if (config.protocol === 'tun') config.port = 0;
        return config;
    }
    function shareLink(db) {
        try {
            const settings=JSON.parse(db.settings || '{}'), stream=JSON.parse(db.streamSettings || '{}');
            const client=(settings.clients || settings.users || [])[0] || {};
            const protocol=db.protocol, address=db.address;
            const host=address.includes(':') ? '['+address+']' : address;
            const endpoint=host+':'+db.port, remark=encodeURIComponent(db.remark || '');
            const net=({raw:'tcp',splithttp:'xhttp',websocket:'ws',mkcp:'kcp'})[stream.network] || stream.network || 'tcp';
            const security=stream.security || 'none';
            if(['http','quic'].includes(net) || security==='xtls') return '';
            if(protocol==='shadowsocks') {
                if((settings.clients || []).length) return '';
                const auth=settings.method.startsWith('2022-') ? encodeURIComponent(settings.method)+':'+encodeURIComponent(settings.password) : Base64.encode(settings.method+':'+settings.password);
                return 'ss://'+auth+'@'+endpoint+'#'+remark;
            }
            if(protocol==='vmess') {
                if(!client.id || security==='reality' || !['tcp','ws','grpc','kcp'].includes(net)) return '';
                const detail=stream.wsSettings || stream.grpcSettings || stream.kcpSettings || {};
                return 'vmess://'+Base64.encode(JSON.stringify({v:'2',ps:db.remark,add:address,port:db.port,id:client.id,aid:0,scy:'auto',net,type:'none',host:detail.host || (detail.headers || {}).Host || '',path:detail.path || detail.serviceName || '',tls:security==='tls'?'tls':'',sni:(stream.tlsSettings || {}).serverName || ''}));
            }
            if(protocol==='hysteria') {
                if(!client.auth) return '';
                const params=new URLSearchParams();
                if((stream.tlsSettings || {}).serverName) params.set('sni',stream.tlsSettings.serverName);
                return 'hysteria2://'+encodeURIComponent(client.auth)+'@'+endpoint+'?'+params+'#'+remark;
            }
            if(!['vless','trojan'].includes(protocol)) return '';
            if(protocol==='vless' && settings.decryption && settings.decryption!=='none') return '';
            const identity=protocol==='vless'?client.id:client.password;
            if(!identity) return '';
            const params=new URLSearchParams({type:net,security});
            if(protocol==='vless') { params.set('encryption','none'); if(client.flow) params.set('flow',client.flow); }
            const tls=stream.tlsSettings || {}, reality=stream.realitySettings || {};
            if(security==='tls') { if(tls.serverName) params.set('sni',tls.serverName); if(tls.alpn) params.set('alpn',tls.alpn.join(',')); }
            if(security==='reality') {
                if(!db.sharePublicKey) return '';
                params.set('pbk',db.sharePublicKey);params.set('fp','chrome');
                params.set('sni',(reality.serverNames || [])[0] || '');params.set('sid',(reality.shortIds || [])[0] || '');
            }
            const spec=transports[stream.network || 'raw'];const detail=spec?stream[spec.key] || {}:{};
            if(detail.path) params.set('path',detail.path);
            if(detail.host || (detail.headers || {}).Host) params.set('host',detail.host || detail.headers.Host);
            if(net==='xhttp') {params.set('mode',detail.mode || 'auto');if(detail.extra) params.set('extra',JSON.stringify(detail.extra));}
            if(net==='grpc' && detail.serviceName) params.set('serviceName',detail.serviceName);
            if(net==='kcp' && detail.seed) params.set('seed',detail.seed);
            return protocol+'://'+encodeURIComponent(identity)+'@'+endpoint+'?'+params+'#'+remark;
        } catch (_) { return ''; }
    }
    return {copy, protocols, transports, security, sniffing, create, validate, shareLink};
})();

// Each field carries a Chinese explanation; JSON controls retain invalid drafts until corrected.
Vue.component('inbound-fields', {
    props: ['value', 'fields'],
    data() { return {drafts: {}, errors: {}}; },
    methods: {
        add(field) {
            if (!Array.isArray(this.value[field.key])) this.$set(this.value, field.key, []);
            this.value[field.key].push(field.create());
        },
        display(field) { return Object.prototype.hasOwnProperty.call(this.drafts, field.key) ? this.drafts[field.key] : JSON.stringify(this.value[field.key], null, 2); },
        change(field, text) {
            this.$set(this.drafts, field.key, text);
            try {
                if (!text.trim()) this.$delete(this.value, field.key);
                else this.$set(this.value, field.key, JSON.parse(text));
                this.$delete(this.errors, field.key);
            } catch (_) { this.$set(this.errors, field.key, 'JSON 格式错误，请检查双引号、逗号和括号'); }
        },
    },
    template: `<a-form layout="inline"><a-form-item v-for="field in fields" :key="field.key" :validate-status="errors[field.key] ? 'error' : ''" :help="errors[field.key]" style="max-width:100%">
        <span slot="label">{{field.label}} <a-tooltip :title="field.help"><a-icon type="question-circle" /></a-tooltip></span>
        <div v-if="field.type === 'list'">
            <div v-for="(item,index) in value[field.key]" :key="index" style="border-bottom:1px solid #eee;padding:6px 0">
                <inbound-fields :value="item" :fields="field.children" />
                <a-button size="small" @click="value[field.key].splice(index,1)">删除此项</a-button>
            </div>
            <a-button size="small" @click="add(field)">添加一项</a-button>
        </div>
        <a-switch v-else-if="field.type === 'bool'" :checked="!!value[field.key]" @change="$set(value, field.key, $event)" />
        <a-select v-else-if="field.type === 'select'" :value="value[field.key]" @change="$set(value, field.key, $event)" style="min-width:180px"><a-select-option v-for="option in field.options" :key="option" :value="option">{{option}}</a-select-option></a-select>
        <a-input-number v-else-if="field.type === 'number'" :value="value[field.key]" @change="$set(value, field.key, $event)" />
        <a-textarea v-else-if="field.type === 'json'" :value="display(field)" @change="change(field, $event.target.value)" :autosize="{minRows:2,maxRows:10}" style="width:100%;min-width:260px" />
        <a-input v-else :type="field.type === 'password' ? 'password' : 'text'" :value="value[field.key]" @input="$set(value, field.key, $event.target.value)" />
    </a-form-item></a-form>`,
});
