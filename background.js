var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
var cookie_store = isFirefox ? 'firefox-private' : '1';
var was_private_window_open = false;

async function is_private_window_open() {
	let private_window_open = false;

	await chrome.windows.getAll().then((windowInfoArray) => {
		for (let windowInfo of windowInfoArray) {
			if (windowInfo['incognito']) {
				private_window_open = true;
				break;
			}
		}
	});

	return private_window_open;
}

async function save_cookies(changeInfo) {
	if (await is_private_window_open() && changeInfo.cookie['storeId'] == cookie_store) {
		let details = { 'storeId': cookie_store };

		if (isFirefox) {
			// Firefox only
			details['firstPartyDomain'] = null; // First-party isolation, return all cookies
			details['partitionKey'] = {}; // Return all cookies from partitioned and unpartitioned storage
		}

		chrome.cookies.getAll(details).then((cookies) => {
			chrome.storage.local.set({ 'cookies': cookies });
		});
	}
}

async function save_cookies_listener() {
	if (await is_private_window_open()) {
		chrome.storage.local.get('auto_save').then((res) => {
			if (res['auto_save']) {
				if (!chrome.cookies.onChanged.hasListener(save_cookies)) {
					chrome.cookies.onChanged.addListener(save_cookies);
				}
			} else {
				if (chrome.cookies.onChanged.hasListener(save_cookies)) {
					chrome.cookies.onChanged.removeListener(save_cookies);
				}
			}
		});
	}
}

function restore_cookies() {
	chrome.storage.local.get('cookies').then((res) => {
		if (res['cookies']) {
			for (let cookie of res['cookies']) {
				cookie['url'] = (cookie['secure'] ? 'https://' : 'http://') + (cookie['domain'].charAt(0) == '.' ? cookie['domain'].substr(1) : cookie['domain']) + cookie['path']; // Required to set the cookie
				delete cookie['hostOnly']; // Not supported
				delete cookie['session']; // Not supported

				chrome.cookies.set(cookie);
			}
		}
	});
}

async function save_local_storage(origin, values) {
	let saved = await chrome.storage.local.get('local_storage').then((res) => res['local_storage'] || {});
	saved[origin] = values;
	await chrome.storage.local.set({ 'local_storage': saved });
}

async function save_private_local_storage() {
	let windows = await chrome.windows.getAll({ 'populate': true });

	for (let windowInfo of windows) {
		if (windowInfo['incognito']) {
			for (let tab of windowInfo['tabs']) {
				let snapshot = await chrome.tabs.sendMessage(tab['id'], { 'action': 'get-local-storage' }).catch(() => null);

				if (snapshot && snapshot['origin']) {
					await save_local_storage(snapshot['origin'], snapshot['values']);
				}
			}
		}
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message['action'] == 'save-local-storage') {
		save_private_local_storage().then(() => sendResponse());
		return true;
	}

	if (message['action'] == 'clear-local-storage') {
		chrome.windows.getAll({ 'populate': true }).then(async (windows) => {
			for (let windowInfo of windows) {
				if (windowInfo['incognito']) {
					for (let tab of windowInfo['tabs']) {
						await chrome.tabs.sendMessage(tab['id'], { 'action': 'clear-local-storage' }).catch(() => {});
					}
				}
			}

			await chrome.storage.local.remove('local_storage');
			sendResponse();
		});
		return true;
	}

	if (message['action'] == 'restore-local-storage') {
		chrome.windows.getAll({ 'populate': true }).then(async (windows) => {
			for (let windowInfo of windows) {
				if (windowInfo['incognito']) {
					for (let tab of windowInfo['tabs']) {
						await chrome.tabs.sendMessage(tab['id'], { 'action': 'restore-local-storage' }).catch(() => {});
					}
				}
			}

			sendResponse();
		});
		return true;
	}

	if (message['action'] == 'store-local-storage' && sender.tab && sender.tab['incognito']) {
		save_local_storage(message['origin'], message['values']).then(() => sendResponse());
		return true;
	}
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.local.get({
		'auto_save': false
	}).then((options) => {
		chrome.storage.local.set(options);
	});
});

chrome.storage.onChanged.addListener((changes) => {
	if (changes['auto_save']) {
		save_cookies_listener();
	}
});

chrome.windows.onCreated.addListener((window) => {
	chrome.extension.isAllowedIncognitoAccess().then((private) => {
		if (private && window['incognito'] && !was_private_window_open) {
			restore_cookies();
			save_cookies_listener();
			was_private_window_open = true;
		}
	});
});

chrome.windows.onRemoved.addListener(async () => {
	if (!await is_private_window_open()) {
		if (chrome.cookies.onChanged.hasListener(save_cookies)) {
			chrome.cookies.onChanged.removeListener(save_cookies);
		}

		was_private_window_open = false;
	}
});