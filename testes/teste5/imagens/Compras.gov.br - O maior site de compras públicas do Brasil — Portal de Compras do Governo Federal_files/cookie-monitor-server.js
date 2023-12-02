import { isUndefined } from './types.js';
import { cookiesByName } from './cookies.js';
import { parentOriginPermissions } from './cookie-monitor-permissions.js';

let
    checkingStatus = false,
    lastCookieValue = null; //Invalid value

function checkStatus(parentOrigin, cookieName, monitorId) {
    if (checkingStatus) {
        return;
    }
    checkingStatus = true;
    
    const cookies = cookiesByName();
    
    let cookieValue = cookies[cookieName];
    if (lastCookieValue === cookieValue) {
        checkingStatus = false;
        return;
    }

    let thirdPartyCookieSupport = cookies['AWSALBCORS'] ? 'true' : undefined;
    window.parent.postMessage({
        messageType: 'cookieChanged',
        monitorId: monitorId,
        oldValue: lastCookieValue,
        newValue: cookieValue,
        thirdPartyCookieSupport
    }, parentOrigin);
    lastCookieValue = cookieValue;
    
    checkingStatus = false;
    return;
}

async function main() {
    const parentOrigin = new URL(window.location.href).searchParams.get('parent-origin');
    const cookieName = new URL(window.location.href).searchParams.get('cookie-name');
    const monitorId = new URL(window.location.href).searchParams.get('monitor-id');

    if(isUndefined(parentOrigin)) {
        throw 'cookie-monitor-server.js main(): parent-origin search param must be set.';
    }

    if(isUndefined(cookieName)) {
        throw 'cookie-monitor-server.js main(): cookie-name search param must be set.';
    }

    if(isUndefined(monitorId)) {
        throw 'cookie-monitor-server.js main(): monitor-id search param must be set.';
    }

    if(isUndefined(parentOriginPermissions)) {
        throw 'cookie-monitor-server.js main(): parentOriginPermissions not found.';
    }

    const cookiesPermissions = parentOriginPermissions[parentOrigin];
    if(isUndefined(cookiesPermissions)) {
        throw `cookie-monitor-server.js main(): cookiesPermissions not found in parentOriginPermissions.${parentOrigin}`;
    }
    const cookiePermissionFound = cookiesPermissions.find(c=>c === cookieName);
    if(isUndefined(cookiePermissionFound)) {
        throw `cookie-monitor-server.js main(): cookieName "${cookieName}" not found in "parentOriginPermissions.${parentOrigin}.cookiesPermissions" at "${new URL('./cookie-monitor-permissions.js', import.meta.url).toString()}".`;
    }
    window.setInterval(async () => {
        try {
            await checkStatus(parentOrigin, cookieName, monitorId);
        } catch (error) {
            window.console.warn(error);
        }
    }, 1000);
}

main();
