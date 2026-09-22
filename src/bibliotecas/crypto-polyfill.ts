// Polyfill for crypto.randomUUID
declare global {
    interface Window {
        crypto: Crypto & {
            randomUUID?: () => string;
        };
    }
}

if (typeof window !== 'undefined') {
    if (!window.crypto) {
        // @ts-ignore
        window.crypto = {};
    }

    if (!window.crypto.randomUUID) {
        // @ts-ignore
        window.crypto.randomUUID = function () {
            // @ts-ignore
            return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
            );
        };
    }
}




