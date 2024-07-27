var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
var cookie_store = isFirefox ? 'firefox-private' : '1';
var file_input = document.querySelector('#file_input');
var objectURL, downloadID;

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

async function clear_private_cookies() {
	let hadListener = false;

	if (chrome.cookies.onChanged.hasListener(save_cookies)) {
		chrome.cookies.onChanged.removeListener(save_cookies);
		hadListener = true;
	}

	if (isFirefox) {
		await chrome.browsingData.removeCookies({ 'cookieStoreId': cookie_store }); // Firefox only
	} else {
		await chrome.cookies.getAll({ 'storeId': cookie_store }).then(async (cookies) => {
			for (let cookie of cookies) {
				await chrome.cookies.remove({
					'storeId': cookie_store,
					'url': (cookie['secure'] ? 'https://' : 'http://') + (cookie['domain'].charAt(0) == '.' ? cookie['domain'].substr(1) : cookie['domain']) + cookie['path'],
					'name': cookie['name']
				});
			}
		});
	}

	if (hadListener) {
		chrome.cookies.onChanged.addListener(save_cookies);
	}
}

async function update_warning() {
	let private_enabled = await chrome.extension.isAllowedIncognitoAccess();
	let access_enabled = await chrome.permissions.contains({ 'origins': [ '<all_urls>' ] });
	let warning_html = '';

	if (!private_enabled && !access_enabled) {
		warning_html = '<strong>Enable the extension in private windows and grant the <em>Access data for all websites</em> permission for this to work.</strong>';
	} else if (!private_enabled) {
		warning_html = '<strong>Enable the extension in private windows for this to work.</strong>';
	} else if (!access_enabled) {
		warning_html = '<strong>Grant the <em>Access data for all websites</em> permission for this to work.</strong>';
	}

	document.querySelector('#warning').innerHTML = warning_html;

	update_save_button();

	document.querySelector('#auto_save').disabled = (!private_enabled || !access_enabled);
}

async function update_save_button() {
	let private_enabled = await chrome.extension.isAllowedIncognitoAccess();
	let access_enabled = await chrome.permissions.contains({ 'origins': [ '<all_urls>' ] });
	let auto_save_enabled = await chrome.storage.local.get('auto_save').then(res => res['auto_save']);
	let private_window_open = await is_private_window_open();

	document.querySelector('#save').disabled = (!private_enabled || !access_enabled || auto_save_enabled || !private_window_open);
}

function update_storage_space_used() {
	// chrome.storage.local.getBytesInUse().then((bytesUsed) => {
	// 	document.querySelector('#storage_space_used').textContent = parseFloat((bytesUsed / Math.pow(1024, 1)).toFixed(2));
	// });

	let bytesUsed = 0;

	chrome.storage.local.get('cookies').then((res) => {
		if (res['cookies']) {
			bytesUsed = new TextEncoder().encode(
				Object.entries(res['cookies'])
					.map(([key, value]) => key + JSON.stringify(value))
					.join('')
			).length;
		}

		document.querySelector('#storage_space_used').textContent = parseFloat((bytesUsed / Math.pow(1024, 1)).toFixed(2));
		document.querySelector('#delete').disabled = bytesUsed === 0;
		document.querySelector('#backup').disabled = bytesUsed === 0;
	});
}

document.addEventListener('DOMContentLoaded', () => {
	chrome.storage.local.get({
		'auto_save': false
	}).then((res) => {
		document.querySelector('#auto_save').checked = res['auto_save'];
	});

	update_warning();
	update_storage_space_used();
});

chrome.storage.onChanged.addListener((changes) => {
	if (changes['auto_save']) {
		update_save_button();
	} else if (changes['cookies']) {
		update_storage_space_used();
	}
});

chrome.windows.onCreated.addListener((window) => {
	chrome.extension.isAllowedIncognitoAccess().then((private) => {
		if (private && window['incognito']) {
			update_save_button();
		}
	});
});

chrome.windows.onRemoved.addListener(() => {
	update_save_button();
});

chrome.permissions.onAdded.addListener(() => {
	update_warning();
});

chrome.permissions.onRemoved.addListener(() => {
	update_warning();
});

document.querySelector('#save').addEventListener('click', () => {
	chrome.windows.getAll().then((windowInfoArray) => {
		for (let windowInfo of windowInfoArray) {
			if (windowInfo['incognito']) {
				let details = { 'storeId': cookie_store };

				if (isFirefox) {
					// Firefox only
					details['firstPartyDomain'] = null; // First-party isolation, return all cookies
					details['partitionKey'] = {}; // Return all cookies from partitioned and unpartitioned storage
				}

				chrome.cookies.getAll(details).then((cookies) => {
					chrome.storage.local.set({ 'cookies': cookies });

					update_storage_space_used();
				});

				break;
			}
		}
	});
});

document.querySelector('#auto_save').addEventListener('change', (event) => {
	chrome.storage.local.set({
		[event.target.id]: event.target.checked
	});

	if (event.target.checked) {
		document.querySelector('#save').dispatchEvent(new Event('click'));
	}
});

document.querySelector('#delete').addEventListener('click', () => {
	chrome.storage.local.remove('cookies').then(async () => {
		update_storage_space_used();

		if (await is_private_window_open()) {
			clear_private_cookies();
		}
	});
});

chrome.downloads.onChanged.addListener((download) => {
	if (download['id'] == downloadID && download['state'] && download['state']['current'] != 'in_progress') {
		downloadID = undefined;

		URL.revokeObjectURL(objectURL);
		objectURL = undefined;
	}
});

document.querySelector('#backup').addEventListener('click', () => {
	chrome.storage.local.get('cookies').then((res) => {
		if (res['cookies']) {
			objectURL = URL.createObjectURL(new Blob([JSON.stringify(res['cookies'])], { 'type': 'application/json' }));

			chrome.downloads.download({
				'url': objectURL,
				'filename': 'cookies.json',
				'saveAs': true
			}).then((id) => {
				downloadID = id;
			});
		}
	});
});

file_input.addEventListener('change', () => {
	let file = file_input.files[0];

	if (file.size === 0) {
		return;
	}

	new Blob([file], { 'type': 'application/json' }).text().then(async (text) => {
		let cookies = JSON.parse(text);

		// Convert cookies if needed
		for (let cookie of cookies) {
			// Change cookie store if needed
			if (cookie['storeId'] == (isFirefox ? '1' : 'firefox-private')) {
				cookie['storeId'] = cookie_store;
			}

			if (isFirefox) {
				if (cookie['sameSite'] == 'unspecified') { // Chromium only
					cookie['sameSite'] = 'no_restriction';
				}

				if (cookie['firstPartyDomain'] === undefined) {
					cookie['firstPartyDomain'] = ''; // Firefox only
				}

				if (cookie['partitionKey'] === undefined) {
					cookie['partitionKey'] = null; // Firefox only
				}
			} else {
				// Chromium only, if sameSite=no_restriction then secure=true is required
				if (!cookie['secure'] && cookie['sameSite'] == 'no_restriction') {
					cookie['sameSite'] = 'unspecified';
				}

				if (cookie['firstPartyDomain'] !== undefined) {
					delete cookie['firstPartyDomain']; // Firefox only
				}

				if (cookie['partitionKey'] !== undefined) {
					delete cookie['partitionKey']; // Firefox only
				}
			}
		}

		chrome.storage.local.set({ 'cookies': cookies });
		file_input.value = '';

		if (await is_private_window_open()) {
			await clear_private_cookies();
			restore_cookies();
		}
	});
});

document.querySelector('#restore').addEventListener('click', () => {
	file_input.click();
});