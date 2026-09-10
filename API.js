const routeParser = require('./lib/route-parser.js');

/*
	Gloabal or window-specific API builder

	Uses Express electrolite[ get, post, use ] system methods
	NOTE: a thrid Object parameter is allowed expecting { replace: bool, signature: String:RouteSignature } to be able to remoad a route

	Schema:
		electrolite.use(async? function: Callback)
		electrolite.get(Srting: route, async? function: Callback, { replace: bool, signature: String }? )
		electrolite.post(Srting: route, async? function: Callback, { replace: bool, signature: String }? )
*/

class APIClass {
	#routes = { get: [], post: [], middleware: [] };
	constructor() {
		this.hasRoutes   = false;

		this.get         = this.get.bind(this);
		this.use         = this.use.bind(this);
		this.post        = this.post.bind(this);
		this.getRoute    = this.getRoute.bind(this);
	}

	use(middleware) {
		this.#routes.middleware.push(middleware);
	}

	get(route, callback, opt = {}) {
		this.#deleteIfRouteReplace(route, "get", opt);
		this.#throwErrorIfExists(route, "get");
		this.hasRoutes = true;
		this.#routes.get.push({
			path: new routeParser(route),
			callback: callback,
			rawRoute: route,
			options: opt
		});
	}

	post(route, callback, opt = {}) {
		this.#deleteIfRouteReplace(route, "post", opt);
		this.#throwErrorIfExists(route, "post");
		this.hasRoutes = true;
		this.#routes.post.push({
			path: new routeParser(route),
			callback: callback,
			rawRoute: route,
			options: opt
		});
	}

	#deleteIfRouteReplace(route, type, opt) {
		if (!opt.replace) return;
		const found = this.#routes[ type ].filter(r => r.rawRoute === route)[0];
		if (!found) return;

		const { signature, replace } = found.options;

		if (!replace) return;
		if (signature !== opt.signature) { throw new Error(`[ERROR] Missmatch signature for route [${ type }] ${ route }`); }
		this.#routes[ type ] = this.#routes[ type ].filter(route => route !== found);
	}

	#throwErrorIfExists(route, method) {
		let exists = false;
		let isWildcard = route[route.length - 1] === "*";
		this.#routes[ method ].forEach((routeElement) => {
			if (routeElement.path.match(route)) {
				exists = true;
			}
		});

		if (exists) throw new Error(`Route [${ method }] ${ route } already exists`);
	}

	#getRouteAndParams(routeWithQueryParams) {
		const routeAndQueryParams = routeWithQueryParams.split("?");
		const route = routeAndQueryParams[0];
		const query = {};
		(routeAndQueryParams[1] || '').split("&").forEach((argWithValue) => {
			const argAndValue = argWithValue.split("=");
			if (argAndValue.length === 2) { query[ argAndValue[0] ] = argAndValue[1]; }
		});
		return { route, query };
	}

	clean() { // Clean orphaned and defunct callback routes
		[ "get", "post" ].forEach((type) => {
			this.#routes[ type ] = this.#routes[ type ].filter((route) => {
				const validCallback = !!route.callback;
				if (!validCallback) console.log(`[CLEAN] Removed dead route [${ type }] ${ route.path }`);
				return validCallback;
			});
		});
		this.#routes.middleware = this.#routes.middleware.filter(Boolean);
	}

	getRoute(routeWithQueryParams, method, callerWindow) {
		let promise     = undefined;
		const { route, query } = this.#getRouteAndParams(routeWithQueryParams);


		for(let i = 0; i < this.#routes[ method ].length; i++) {
			const matchedRoute = this.#routes[ method ][ i ].path.match(route);
			if (matchedRoute) {
				matchedRoute.__proto__.getWindow = () => { return callerWindow; }
				promise = async (values) => {
					let req = {
						url: route,
						method: method.toUpperCase(),
						params: matchedRoute,
						query: query,
						pathname: routeWithQueryParams,
						...(method === "post" ? { body: values } : {}),
					};

					const lastCallback = this.#routes[ method ][ i ].callback;

					let result = undefined;
					try {
						if (this.#routes.middleware.length === 0) {
							result = await lastCallback(req);
						} else {
							let cursor      = 0;
							let breakpoint  = false;
							let breakValue  = undefined;
							const traceCall = [ ...this.#routes.middleware, lastCallback ];

							for await (const middleware of traceCall) {
								if (breakpoint) { return breakValue; }
								const next = traceCall[ ++cursor ];
								const res = (values) => { breakpoint = true; breakValue = values; };
								result = await middleware(req, res, next);
							}
						}
						return result;
					} catch(error) {
						console.log(error);
						return error;
					}
				};
				break
			}
		}

		return promise;
	}
}

module.exports = APIClass;