browser.windows.onCreated.addListener((window) => {
	if (window.incognito) {
		browser.extension.isAllowedIncognitoAccess().then((private) => {
			if (private) {
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
				});
			}
		});
	}
});