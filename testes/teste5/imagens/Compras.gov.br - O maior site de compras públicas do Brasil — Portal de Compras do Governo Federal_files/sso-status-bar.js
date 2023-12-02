import { loadDocumentFragment, setAttribute } from './wc.js';
import { isNull, isNotNull, isDefined } from './types.js';
import '../../../cookie-monitor/src/js/cookie-monitor.js';
import '../../../oauth2-authorization/src/js/oauth2-authorization.js';
import { EncryptedLocalStorage } from '../../../encrypted-local-storage/src/js/encrypted-local-storage.js';
import './sso-status-bar-section.js';
import './sso-status-bar-item.js';

//Constants
const
    assets = {
        template: (new URL('../html/sso-status-bar.html', import.meta.url)).toString(),
        fontRawlineStylesheet: (new URL('../font/rawline/css/rawline.css', import.meta.url)).toString(),
        loadingStylesheet: (new URL('../css/loading.css', import.meta.url)).toString(),
        ssoStatusBarStyleSheet: (new URL('../css/sso-status-bar.css', import.meta.url)).toString(),
        emptyAccountPicture: (new URL('../image/user.png', import.meta.url)).toString()
    };

let templateDocument;

async function main() {
    templateDocument = await loadDocumentFragment(assets.template, 'template');

    templateDocument.getElementById('font-rawline-stylesheet').setAttribute('href', assets.fontRawlineStylesheet);
    templateDocument.getElementById('loading-stylesheet').setAttribute('href', assets.loadingStylesheet);
    templateDocument.getElementById('sso-status-bar-stylesheet').setAttribute('href', assets.ssoStatusBarStyleSheet);

    //Hack for fonts
    document.getElementsByTagName('head')[0].appendChild(templateDocument.getElementById('font-rawline-stylesheet').cloneNode(true));

    window.customElements.define('sso-status-bar', SsoStatusBar);
    return 'sso-status-bar'; //return the tag name.
}

class SsoStatusBar extends HTMLElement {
    constructor() {
        super();

        this._ready = Promise.resolve({});
        this._userInfo = {};
        this._thirdPartyCookieEnabled = true;
        this.storage = null;
        this.cookieMonitorCookieName = this.cookieMonitorCookieName || 'Sso-Authenticated';

        const root = templateDocument.cloneNode(true);
        this._elements = {
            root,
            body: root.getElementById('sso-status-bar'),
            accountPictureIcon: root.getElementById('account-picture-icon'),
            // menu: root.getElementById('menu'),
            accountFirstName: root.getElementById('account-first-name'),
            accountName: root.getElementById('account-name'),
            accountEmail: root.getElementById('account-email'),
            accountMainReliabilityLevel: root.getElementById('account-main-reliability-level'),
            cookieMonitor: root.getElementById('cookie-monitor'),
            oauth2Authorization: root.getElementById('oauth2-authorization')
        };

        this._elements.accountPictureIcon.setAttribute('src', assets.emptyAccountPicture);

        setAttribute(this._elements.cookieMonitor, 'server-iframe-src', this.cookieMonitorSrc);
        setAttribute(this._elements.cookieMonitor, 'cookie-name', this.cookieMonitorCookieName);
        this.setAttribute('tabindex', 0);

        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.append(this._elements.root);
        this._elements.cookieMonitor.addEventListener('cookieChanged', event => this._cookieMonitorCookieChanged(event));
        this._elements.oauth2Authorization.addEventListener('authorizationStarted', event => this._oauth2AuthorizationStarted(event));
        this._elements.oauth2Authorization.addEventListener('authorized', event => this._oauth2Authorized(event));
        this._elements.oauth2Authorization.addEventListener('authorizationError', event => this._oauth2AuthorizationError(event));

        this.addEventListener('ready', event => this.onReady && new Function(['event'], this.onReady)(event));
        this.addEventListener('authorizationStarted', event => this.onAuthorizationStart && new Function(['event'], this.onAuthorizationStart)(event));
        this.addEventListener('authorized', event => this.onAuthorize && new Function(['event'], this.onAuthorize)(event));
        this.addEventListener('authorizationError', event => this.onAuthorizationError && new Function(['event'], this.onAuthorizationError)(event));
        this.addEventListener('signedOut', event => this.onSignOut && new Function(['event'], this.onSignOut)(event));

        this.addEventListener('blur', event => this.closeMenu(event));

        this._loadLocalStoredSignedState();
    }

    get cookieMonitorSrc() { return this.getAttribute('cookie-monitor-src'); }
    set cookieMonitorSrc(value) { setAttribute(this, 'cookie-monitor-src', value); }
    get cookieMonitorCookieName() { return this.getAttribute('cookie-monitor-cookie-name'); }
    set cookieMonitorCookieName(value) { setAttribute(this, 'cookie-monitor-cookie-name', value); }
    get authorizationSrc() { return this.getAttribute('authorization-src'); }
    set authorizationSrc(value) { setAttribute(this, 'authorization-src', value); }
    get signInHref() { return this.getAttribute('sign-in-href'); }
    set signInHref(value) { setAttribute(this, 'sign-in-href', value); }
    get signOutHref() { return this.getAttribute('sign-out-href'); }
    set signOutHref(value) { setAttribute(this, 'sign-out-href', value); }

    get onReady() { return this.getAttribute('onready'); }
    set onReady(value) { setAttribute(this, 'onready', value); }
    get onAuthorizationStart() { return this.getAttribute('onauthorizationstart'); }
    set onAuthorizationStart(value) { setAttribute(this, 'onauthorizationstart', value); }
    get onAuthorize() { return this.getAttribute('onauthorize'); }
    set onAuthorize(value) { setAttribute(this, 'onauthorize', value); }
    get onAuthorizationError() { return this.getAttribute('onauthorizationerror'); }
    set onAuthorizationError(value) { setAttribute(this, 'onauthorizationerror', value); }
    get onSignOut() { return this.getAttribute('onsignout'); }
    set onSignOut(value) { setAttribute(this, 'onsignout', value); }

    get userInfo() { return { ... this._userInfo }; }

    static get observedAttributes() {
        return ['cookie-monitor-src', 'cookie-monitor-cookie-name', 'authorization-src', 'sign-in-href', 'sign-out-href'];
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
        if (attrName === 'cookie-monitor-src') {
            setAttribute(this._elements.cookieMonitor, 'server-iframe-src', this.cookieMonitorSrc);
            return;
        }

        if (attrName === 'cookie-monitor-cookie-name') {
            setAttribute(this._elements.cookieMonitor, 'cookie-name', this.cookieMonitorCookieName);
            return;
        }

        if (attrName === 'authorization-src') {
            setAttribute(this._elements.oauth2Authorization, 'authorization-src', this.authorizationSrc);
            return;
        }
    }

    _capitalizeFullname(fullname) {
        var small = "(e|da|das|de|do|dos|v[.]?|via|vs[.]?)";
        var punct = "([!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]*)";
      
        var parts = [], split = /[:.;?!] |(?: |^)["Ò]/g, index = 0;
        
        while (true) {
            var m = split.exec(fullname);

            parts.push( fullname.substring(index, m ? m.index : fullname.length)
                .replace(/\b([A-Za-z][a-z.'Õ]*)\b/g, function(all){
                    return /[A-Za-z]\.[A-Za-z]/.test(all) ? all : upper(all);
                })
                .replace(RegExp("\\b" + small + "\\b", "ig"), lower)
                .replace(RegExp("^" + punct + small + "\\b", "ig"), function(all, punct, word){
                    return punct + upper(word);
                })
                .replace(RegExp("\\b" + small + punct + "$", "ig"), upper));
            
            index = split.lastIndex;
            
            if ( m ) parts.push( m[0] );
            else break;
        }
        
        return parts.join("").replace(/ V(s?)\. /ig, " v$1. ")
            .replace(/(['Õ])S\b/ig, "$1s")
            .replace(/\b(AT&T|Q&A)\b/ig, function(all){
                return all.toUpperCase();
            });
        
        function lower(word){
            return word.toLowerCase();
        }
        
        function upper(word){
          return word.substr(0,1).toUpperCase() + word.substr(1);
        }
    }

    _cookieMonitorCookieChanged(event) {
        const sid = event.detail.newValue;

        //TODO Option to control automatic signOut or not.
        if (isNull(sid)) {
            if(isDefined(this._userInfo.name) && event.detail.thirdPartyCookieSupport !== 'true') {
                if(this._thirdPartyCookieEnabled) {
                    console.log('Third Party Cookie Support seems to be blocked or cookied support is disabled. Automatic sign-in support has been disabled.')
                    this._thirdPartyCookieEnabled = false;
                }
                return;
            }

            this._removeSignedInformation();
            this.storage = null;
            this.dispatchEvent(new CustomEvent('signedOut', { bubbles: false, composed: false, detail: this.userInfo }));
            return;
        }

        if (isNull(this.storage)) {
            this.storage = new EncryptedLocalStorage(sid, { useCookies: true });
        }

        this._ready = (async () => {
            await this._ready;

            let data;
            try {
                data = await this.storage.getItem('Sso-Status-Bar-Session');
            } catch (error) {
                data = null;
            }

            if (isNotNull(data)) {
                this._setSignedInformation(data);
                return data;
            }

            this._elements.oauth2Authorization.active = true;
            return {};
        })();
    }

    _oauth2AuthorizationStarted(event) {
        //this._elements.body.className = 'sso-status-bar closed-menu';
        this.dispatchEvent(new CustomEvent('authorizationStarted', { bubbles: false, composed: false, detail: event.detail.data }));
    }

    _oauth2Authorized(event) {
        this._ready = (async () => {
            await this._ready;

            this._elements.oauth2Authorization.active = undefined;
            await this.storage.setItem('Sso-Status-Bar-Session', event.detail.data);
            this._setSignedInformation(event.detail.data);
            this.dispatchEvent(new CustomEvent('authorized', { bubbles: false, composed: false, detail: this.userInfo }));

            return event.detail.data;
        })();
    }

    _oauth2AuthorizationError(event) {
        this._elements.oauth2Authorization.active = undefined;
        this._removeSignedInformation();
        this._elements.body.classList.add('error');
        this.dispatchEvent(new CustomEvent('authorizationError', { bubbles: false, composed: false, detail: event.detail.data }));
    }

    _loadLocalStoredSignedState() {
        this._ready = (async () => {
            await this._ready;

            const storage = new EncryptedLocalStorage(null, { useCookies: true })
            let data;
            try {
                data = await storage.getItem('Sso-Status-Bar-Session');
            } catch (error) {
                //Do nothing, data is null.
            }

            if (isNull(data)) {
                this._removeSignedInformation();

                if(!window.localStorage.getItem('govbr_primeiro_acesso_signed_out')) {
                    window.localStorage.setItem('govbr_primeiro_acesso_signed_out', '1');                    
                    document.body.classList.add('login-overlay-active');
                    this._elements.body.classList.add('sso-status-bar');
                    this._elements.body.classList.add('signed-out');
                    this._elements.body.classList.add('closed-menu');
                    this._elements.body.classList.add('login-overlay-active');
                    this._elements.body.classList.add('overlay-so');                    
                } else {                    
                    this._elements.body.classList.add('sso-status-bar');
                    this._elements.body.classList.add('signed-out');
                    this._elements.body.classList.add('closed-menu');                    
                }

                this.dispatchEvent(new CustomEvent('ready', { bubbles: false, composed: false, detail: this.userInfo }));
                return {};
            }
            this.storage = storage;
            this._setSignedInformation(data);

            if(!window.localStorage.getItem('govbr_primeiro_acesso_signed_in')) {
                window.localStorage.setItem('govbr_primeiro_acesso_signed_in', '1');
                document.body.classList.add('login-overlay-active');
                this._elements.body.classList.add('sso-status-bar');
                this._elements.body.classList.add('signed-in');
                this._elements.body.classList.add('closed-menu');
                this._elements.body.classList.add('login-overlay-active');
                this._elements.body.classList.add('overlay-si');
            } else {                
                this._elements.body.classList.add('sso-status-bar');
                this._elements.body.classList.add('signed-in');
                this._elements.body.classList.add('closed-menu');                
            }

            this.dispatchEvent(new CustomEvent('ready', { bubbles: false, composed: false, detail: this.userInfo }));
        })();
    }

    _setSignedInformation(data) {
        if (isNull(data.userInfo)) {
            _removeSignedInformation();
            throw 'sso-status-bar.js _signIn data.userInfo must be not null';
        }

        this._userInfo = data.userInfo;

        this._elements.accountFirstName.textContent = data.userInfo.name.split(" ")[0];
        this._elements.accountName.textContent = data.userInfo.name;
        this._elements.accountEmail.textContent = data.userInfo.email;
        if(!(data?.userInfo?.mainReliabilityLevel)) {
            this._elements.accountMainReliabilityLevel.removeAttribute('data-main-reliability-level');
        } else {
            this._elements.accountMainReliabilityLevel.setAttribute('data-main-reliability-level', data.userInfo.mainReliabilityLevel);
        }

        this._elements.accountPictureIcon.src =
            isNotNull(data.userInfo.pictureDataUri) && data.userInfo.pictureDataUri.startsWith('data:') ?
                data.userInfo.pictureDataUri :
                assets.emptyAccountPicture;        
    }

    _removeSignedInformation() {
        this._userInfo = {};        
        this._elements.accountFirstName.textContent = '';
        this._elements.accountName.textContent = '';
        this._elements.accountEmail.textContent = '';
        this._elements.accountPictureIcon.src = assets.emptyAccountPicture;

        if (isNotNull(this.storage)) {
            this.storage.clearKey();
        }
        window.localStorage.removeItem('Sso-Status-Bar-Session');
    }

    signIn() {
        if (isNotNull(this.signInHref)) {
            window.location.assign(this.signInHref);
        }
    }

    signOut() {
        this._removeSignedInformation();
        this.storage = null;
        this.dispatchEvent(new CustomEvent('signedOut', { bubbles: false, composed: false, detail: this.userInfo }));
        if (isNull(this.signOutHref)) {
            return;
        }
        window.location.assign(this.signOutHref);
    }

    openMenu(event) {
        if (!this._elements.body.classList.contains('signed-in')) {
            return;
        }
        this._elements.body.className = 'sso-status-bar signed-in opened-menu';
    }

    closeMenu(event) {
        if (
            isNotNull(event) 
            && 
            isNotNull(event.relatedTarget) 
            && 
            event.relatedTarget.nodeName.toUpperCase() === "sso-status-bar-item".toUpperCase() 
        ) {
            return;
        }
        this._elements.body.classList.remove('opened-menu');
        this._elements.body.classList.add('closed-menu');
    }

    toggleMenu(event) {
        if (this._elements.body.classList.contains('opened-menu')) {
            this.closeMenu();
            return;
        }
        if (this._elements.body.classList.contains('closed-menu')) {
            this.openMenu();
        }

    }

    closeOverlay(event) {
        document.body.classList.remove('login-overlay-active');
        this._elements.body.classList.add('fade-out');
        this._elements.body.classList.remove('login-overlay-active');
    }
}

main();
