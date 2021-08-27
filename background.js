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
	if (await is_private_window_open() && changeInfo.cookie['storeId'] == 'firefox-private') {
		browser.cookies.getAll({ 'storeId': 'firefox-private' }).then((cookies) => {
			browser.storage.local.set({ 'cookies': cookies });
		});
	}
}

async function save_cookies_listener() {
	if (await is_private_window_open()) {
		browser.storage.local.get('auto_save').then((res) => {
			if (res.auto_save) {
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
		if (private && window['incognito']) {
			browser.storage.local.get('cookies').then((res) => {
				if (res.cookies) {
					// Restore cookies
					res.cookies.forEach((cookie) => {
						cookie['url'] = (cookie['secure'] ? 'https://' : 'http://') + (cookie['domain'].charAt(0) == '.' ? cookie['domain'].substr(1) : cookie['domain']) + cookie['path']; // Required to set the cookie
						delete cookie['hostOnly']; // Not supported
						delete cookie['session']; // Not supported

						browser.cookies.set(cookie);
					});
				}

				save_cookies_listener();
			});
		}
	});
});

browser.windows.onRemoved.addListener(async () => {
	if (!await is_private_window_open() && browser.cookies.onChanged.hasListener(save_cookies)) {
		browser.cookies.onChanged.removeListener(save_cookies);
	}
});