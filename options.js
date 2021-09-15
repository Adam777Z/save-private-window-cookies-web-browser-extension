var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
var cookie_store = isFirefox ? 'firefox-private' : '1';
var file_input = document.querySelector('#file_input');
var background_page, objectURL, downloadID;

browser.runtime.getBackgroundPage().then((page) => {
	background_page = page;
});

function update_save_button() {
	browser.storage.local.get('auto_save').then((res) => {
		if (res['auto_save']) {
			document.querySelector('#save').disabled = true;
		} else {
			browser.windows.getAll().then((windowInfoArray) => {
				let private_window_open = false;

				for (let windowInfo of windowInfoArray) {
					if (windowInfo['incognito']) {
						private_window_open = true;
						break;
					}
				}

				document.querySelector('#save').disabled = !private_window_open;
			});
		}
	});
}

function update_storage_space_used() {
	// browser.storage.local.getBytesInUse().then((bytesUsed) => {
	// 	document.querySelector('#storage_space_used').textContent = parseFloat((bytesUsed / Math.pow(1024, 1)).toFixed(2));
	// });

	let bytesUsed = 0;

	browser.storage.local.get('cookies').then((res) => {
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
	browser.storage.local.get({
		'auto_save': false
	}).then((res) => {
		document.querySelector('#auto_save').checked = res['auto_save'];
	});

	update_save_button();
	update_storage_space_used();
});

document.querySelector('#save').addEventListener('click', () => {
	browser.windows.getAll().then((windowInfoArray) => {
		for (let windowInfo of windowInfoArray) {
			if (windowInfo['incognito']) {
				browser.cookies.getAll({ 'storeId': cookie_store }).then((cookies) => {
					browser.storage.local.set({ 'cookies': cookies });

					update_storage_space_used();
				});

				break;
			}
		}
	});
});

document.querySelector('#auto_save').addEventListener('change', (event) => {
	browser.storage.local.set({
		[event.target.id]: event.target.checked
	});

	if (event.target.checked) {
		document.querySelector('#save').dispatchEvent(new Event('click'));
	}
});

document.querySelector('#delete').addEventListener('click', () => {
	browser.storage.local.remove('cookies').then(async () => {
		update_storage_space_used();

		if (await background_page.is_private_window_open()) {
			background_page.clear_private_cookies();
		}
	});
});

browser.extension.isAllowedIncognitoAccess().then((private) => {
	if (!private) {
		document.querySelector('#warning').style.display = 'block';
		document.querySelector('#save').disabled = true;
		document.querySelector('#auto_save').disabled = true;
	}
});

browser.windows.onCreated.addListener((window) => {
	browser.extension.isAllowedIncognitoAccess().then((private) => {
		if (private && window['incognito']) {
			update_save_button();
		}
	});
});

browser.windows.onRemoved.addListener(() => {
	update_save_button();
});

browser.storage.onChanged.addListener((changes) => {
	if (changes['auto_save']) {
		update_save_button();
	} else if (changes['cookies']) {
		update_storage_space_used();
	}
});

document.querySelector('#backup').addEventListener('click', () => {
	browser.storage.local.get('cookies').then((res) => {
		if (res['cookies']) {
			objectURL = URL.createObjectURL(new Blob([JSON.stringify(res['cookies'])], { 'type': 'application/json' }));

			browser.downloads.download({
				'url': objectURL,
				'filename': 'cookies.json',
				'saveAs': true
			}).then((id) => {
				downloadID = id;
			});
		}
	});
});

browser.downloads.onChanged.addListener((download) => {
	if (download['id'] == downloadID && download['state'] && download['state']['current'] != 'in_progress') {
		browser.downloads.erase({ 'id': download['id'] }); // Remove the backup file from Downloads
		downloadID = undefined;

		URL.revokeObjectURL(objectURL);
		objectURL = undefined;
	}
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
			} else {
				// Chromium only, if sameSite=no_restriction then secure=true is required
				if (!cookie['secure'] && cookie['sameSite'] == 'no_restriction') {
					cookie['sameSite'] = 'unspecified';
				}

				if (cookie['firstPartyDomain'] !== undefined) {
					delete cookie['firstPartyDomain']; // Firefox only
				}
			}
		}

		browser.storage.local.set({ 'cookies': cookies });
		file_input.value = '';

		if (await background_page.is_private_window_open()) {
			await background_page.clear_private_cookies();
			background_page.restore_cookies();
		}
	});
});

document.querySelector('#restore').addEventListener('click', () => {
	file_input.click();
});