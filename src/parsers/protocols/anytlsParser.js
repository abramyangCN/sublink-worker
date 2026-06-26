import { parseServerInfo, parseUrlParams, parseArray, parseBool, parseMaybeNumber } from '../../utils.js';

function parseUserinfoPassword(userinfo) {
	if (!userinfo) {
		return undefined;
	}
	try {
		const decoded = decodeURIComponent(userinfo);
		if (decoded.includes(':')) {
			return decoded.split(':').pop();
		}
		return decoded;
	} catch (_) {
		return userinfo.includes(':') ? userinfo.split(':').pop() : userinfo;
	}
}

export function parseAnytls(url) {
	const { addressPart, params, name } = parseUrlParams(url);
	const [userinfo, serverInfo] = addressPart.split('@');
	const { host, port } = parseServerInfo(serverInfo);
	const tls = {
		enabled: true,
		server_name: params.sni || params.server_name || params.peer,
		insecure: parseBool(params['skip-cert-verify'] ?? params.insecure ?? params.allowInsecure ?? params.allow_insecure, false),
		alpn: parseArray(params.alpn)
	};

	if (params['client-fingerprint']) {
		tls.utls = {
			enabled: true,
			fingerprint: params['client-fingerprint']
		};
	}

	return {
		tag: name,
		type: 'anytls',
		server: host,
		server_port: port,
		password: params.password || parseUserinfoPassword(userinfo),
		udp: parseBool(params.udp, undefined),
		'idle-session-check-interval': params['idle-session-check-interval'],
		'idle-session-timeout': params['idle-session-timeout'],
		'min-idle-session': parseMaybeNumber(params['min-idle-session']),
		tls
	};
}
