function update_storage_space_used() {
	// browser.storage.local.getBytesInUse().then((bytesUsed) => {
	// 	document.querySelector('#storage_space_used').innerHTML = parseFloat((bytesUsed / Math.pow(1024, 1)).toFixed(2));
	// });

	let bytesUsed = 0;

	browser.storage.local.get('cookies').then((res) => {
		if (res.cookies) {
			bytesUsed = new TextEncoder().encode(
				Object.entries(res.cookies)
					.map(([key, value]) => key + JSON.stringify(value))
					.join('')
			).length;
		}

		document.querySelector('#storage_space_used').innerHTML = parseFloat((bytesUsed / Math.pow(1024, 1)).toFixed(2));
	});
}

document.addEventListener('DOMContentLoaded', () => {
	update_storage_space_used();
});

document.querySelector('#save').addEventListener('click', () => {
	browser.windows.getAll().then((windowInfoArray) => {
		for (windowInfo of windowInfoArray) {
			if (windowInfo.incognito) {
				browser.cookies.getAll({ 'storeId': 'firefox-private' }).then((cookies) => {
					browser.storage.local.set({ 'cookies': cookies });

					update_storage_space_used();
				});

				break;
			}
		}
	});
});

document.querySelector('#delete').addEventListener('click', () => {
	// document.querySelector('#delete').style.display = 'none';

	browser.storage.local.clear().then(() => {
		update_storage_space_used();

		document.querySelector('#deleted').style.display = 'inline-block';

		setTimeout(() => {
			document.querySelector('#deleted').style.display = 'none';
			// document.querySelector('#delete').style.display = 'inline-block';
		}, 2000);
	});
});

browser.extension.isAllowedIncognitoAccess().then((private) => {
	if (!private) {
		document.querySelector('#save').disabled = true;
		document.querySelector('#warning').style.display = 'block';
	}
});