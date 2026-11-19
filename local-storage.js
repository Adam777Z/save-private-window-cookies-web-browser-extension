(() => {
	if (!chrome.extension.inIncognitoContext || !location.origin || location.origin == 'null') {
		return;
	}

	const origin = location.origin;
	let autoSave = false;
	let valuesReady = false;
	let lastSavedValues;
	let saveInProgress = false;

	function getValues() {
		let values = {};

		for (let index = 0; index < localStorage.length; index++) {
			let key = localStorage.key(index);
			values[key] = localStorage.getItem(key);
		}

		return values;
	}

	function restoreValues() {
		return chrome.storage.local.get('local_storage').then((res) => {
			let values = res['local_storage'] && res['local_storage'][origin];

			if (values) {
				for (let [key, value] of Object.entries(values)) {
					localStorage.setItem(key, value);
				}
			}
		});
	}

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message['action'] == 'get-local-storage') {
			sendResponse({ 'origin': origin, 'values': getValues() });
		} else if (message['action'] == 'clear-local-storage') {
			localStorage.clear();
			sendResponse();
		} else if (message['action'] == 'restore-local-storage') {
			restoreValues();
			sendResponse();
		}
	});

	chrome.storage.onChanged.addListener((changes) => {
		if (changes['auto_save']) {
			autoSave = changes['auto_save']['newValue'];
		}
	});
	chrome.storage.local.get('auto_save').then((res) => {
		autoSave = res['auto_save'];
	});

	function saveLocalStorage() {
		if (!autoSave || !valuesReady || saveInProgress) {
			return;
		}

		let values = getValues();
		let serializedValues = JSON.stringify(values);
		if (serializedValues == lastSavedValues) {
			return;
		}

		saveInProgress = true;
		chrome.runtime.sendMessage({
			'action': 'store-local-storage',
			'origin': origin,
			'values': values
		}).then(() => {
			lastSavedValues = serializedValues;
		}).catch(() => {}).finally(() => {
			saveInProgress = false;
		});
	}

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState == 'hidden') {
			saveLocalStorage();
		}
	});
	addEventListener('pagehide', saveLocalStorage);

	restoreValues().then(() => {
		valuesReady = true;
		setInterval(saveLocalStorage, 1000);
	});
})();