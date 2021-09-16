var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
var cookie_store = isFirefox ? 'firefox-private' : '1';
var was_private_window_open = false;

async function is_private_window_open() {
	let private_window_open = false;

	await browser.windows.getAll().then((windowInfoArray) => {
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
		browser.cookies.getAll({ 'storeId': cookie_store }).then((cookies) => {
			browser.storage.local.set({ 'cookies': cookies });
		});
	}
}

async function save_cookies_listener() {
	if (await is_private_window_open()) {
		browser.storage.local.get('auto_save').then((res) => {
			if (res['auto_save']) {
				if (!browser.cookies.onChanged.hasListener(save_cookies)) {
					browser.cookies.onChanged.addListener(save_cookies);
				}
			} else {
				if (browser.cookies.onChanged.hasListener(save_cookies)) {
					browser.cookies.onChanged.removeListener(save_cookies);
				}
			}
		});
	}
}

function restore_cookies() {
	browser.storage.local.get('cookies').then((res) => {
		if (res['cookies']) {
			for (let cookie of res['cookies']) {
				cookie['url'] = (cookie['secure'] ? 'https://' : 'http://') + (cookie['domain'].charAt(0) == '.' ? cookie['domain'].substr(1) : cookie['domain']) + cookie['path']; // Required to set the cookie
				delete cookie['hostOnly']; // Not supported
				delete cookie['session']; // Not supported

				browser.cookies.set(cookie);
			}
		}
	});
}

async function clear_private_cookies() {
	let hadListener = false;

	if (browser.cookies.onChanged.hasListener(save_cookies)) {
		browser.cookies.onChanged.removeListener(save_cookies);
		hadListener = true;
	}

	if (isFirefox) {
		await browser.browsingData.removeCookies({ 'cookieStoreId': cookie_store }); // Firefox only
	} else {
		await browser.cookies.getAll({ 'storeId': cookie_store }).then(async (cookies) => {
			for (let cookie of cookies) {
				await browser.cookies.remove({
					'storeId': cookie_store,
					'url': (cookie['secure'] ? 'https://' : 'http://') + (cookie['domain'].charAt(0) == '.' ? cookie['domain'].substr(1) : cookie['domain']) + cookie['path'],
					'name': cookie['name']
				});
			}
		});
	}

	if (hadListener) {
		browser.cookies.onChanged.addListener(save_cookies);
	}
}

browser.runtime.onInstalled.addListener(() => {
	browser.storage.local.get({
		'auto_save': false
	}).then((options) => {
		browser.storage.local.set(options);
	});
});

browser.storage.onChanged.addListener((changes) => {
	if (changes['auto_save']) {
		save_cookies_listener();
	}
});

browser.windows.onCreated.addListener((window) => {
	browser.extension.isAllowedIncognitoAccess().then((private) => {
		if (private && window['incognito'] && !was_private_window_open) {
			restore_cookies();
			save_cookies_listener();
			was_private_window_open = true;
		}
	});
});

browser.windows.onRemoved.addListener(async () => {
	if (!await is_private_window_open()) {
		if (browser.cookies.onChanged.hasListener(save_cookies)) {
			browser.cookies.onChanged.removeListener(save_cookies);
		}

		was_private_window_open = false;
	}
});