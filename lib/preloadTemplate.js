const { contextBridge, ipcRenderer, webUtils } = require('electron');

const errorWrapper = async (route, method, value) => {
	try {
		const res = await ipcRenderer.sendSync("callAPI", route, method, value);
		return res instanceof Error ? { UNCAUGHT_ERROR: res.message } : res;
	} catch (error) {
		return { UNCAUGHT_ERROR: error.message };
	}
}


const config = ipcRenderer.sendSync("get-config");
const preloadOptions = {
	get: true, post: true,
	on: true, emit: true, detach: true,

	getFilePath: false,

	...((config && config.preloadMethods) || {})
};

const APIMethods = {
	get: async (route) => {
		const res = await errorWrapper(route, 'get', undefined);
		return res;
	},
	post: async (route, values) => {
		const res = await errorWrapper(route, 'post', values);
		return res;
	},
	on: (event, callback) => {
		return ipcRenderer.on(event, callback);
	},
	detach: (event, callback) => {
		ipcRenderer.removeListener(event, callback);
	},
	emit () {
		if (typeof arguments[0] !== "string" || arguments[0].trim().length === 0) throw new Error("emit expects a signal name");
		ipcRenderer.sendSync("emit", ...arguments);
	},
	getFilePath: (file) => { // Converts the File object to an absolute system path
		return webUtils.getPathForFile(file);
	}
};

const APIPassedMethods = {};
Object.keys(preloadOptions).forEach((key) => {
	if (preloadOptions[ key ] === true) {
		APIPassedMethods[ key ] = APIMethods[ key ];
	}
});

contextBridge.exposeInMainWorld(config.apiName, APIPassedMethods);