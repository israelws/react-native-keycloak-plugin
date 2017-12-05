import { Linking } from 'react-native';
import * as querystring from 'query-string';
import uuidv4 from 'uuid/v4';
import { decodeToken } from './util';


export class Login {
    state;
    conf;
    tokenStorage;
    headers;
    decodeToken;

    constructor() {
      this.state = {};
      this.onOpenURL = this.onOpenURL.bind(this);
      Linking.addEventListener('url', this.onOpenURL);
      this.headers = new Headers();
      this.headers.set('Content-Type', 'application/x-www-form-urlencoded');
      this.decodeToken = decodeToken;
    }

    getTokens() {
      return this.tokenStorage.loadTokens();
    }

    startLoginProcess(conf) {
      this.setConf(conf);
      return new Promise(((resolve, reject) => {
        const { url, state } = this.getLoginURL();
        this.state = {
          ...this.state,
          resolve,
          reject,
          state,
        };
        Linking.openURL(url);
      }));
    }

    setConf(conf) {
      this.conf = (conf) || undefined;
    }

    logoutKc() {
      const { client_id } = this.conf;

      return this.tokens().then((savedTokens) => {
        if (!savedTokens) {
          throw new Error('No saved tokens');
        }
        const body = querystring.stringify({
          client_id,
          refresh_token: savedTokens.refresh_token,
        });

        const url = `${this.getRealmURL()}/protocol/openid-connect/logout`;
        return fetch(url, {
          method: 'POST',
          headers: this.headers,
          body,
        }).then((response) => {
          if (response.ok) {
            this.tokenStorage.clearTokens();
          }
        });
      });
    }

    onOpenURL(event) {
      if (event.url.startsWith(this.conf.appsite_uri)) {
        const {
          state,
          code,
        } = querystring.parse(querystring.extract(event.url));
        if (this.state.state === state) {
          this.retrieveTokens(code);
        }
      }
    }

    retrieveTokens(code) {
      const {
        redirect_uri,
        client_id,
      } = this.conf;
      const url = `${this.getRealmURL()}/protocol/openid-connect/token`;

      const body = querystring.stringify({
        grant_type: 'authorization_code',
        redirect_uri,
        client_id,
        code,
      });

      fetch(url, {
        method: 'POST',
        headers: this.headers,
        body,
      }).then((response) => {
        response.json().then((json) => {
          if (json.error) {
            this.state.reject(json);
          } else {
            this.tokenStorage.saveTokens(json);
            this.state.resolve(json);
          }
        });
      });
    }

    retrieveUserInfo() {
      return this.tokens().then((savedTokens) => {
        if (!savedTokens) {
          throw new Error('no tokens found');
        }
        this.headers.set('Authorization', `Bearer ${savedTokens.access_token}`);

        const url = `${this.getRealmURL()}/protocol/openid-connect/userinfo`;
        return fetch(url, {
          method: 'GET',
          headers: this.headers,
        }).then(response => response.json()).catch(() => {});
      });
    }

    getRealmURL() {
      const {
        url,
        realm,
      } = this.conf;
      const slash = url.endsWith('/') ? '' : '/';
      return `${url + slash}realms/${encodeURIComponent(realm)}`;
    }

    getLoginURL() {
      const { redirect_uri, client_id, kc_idp_hint } = this.conf;
      const responseType = 'code';
      const state = uuidv4();
      const scope = 'openid';
      const url = `${this.getRealmURL()}/protocol/openid-connect/auth?${querystring.stringify({
        scope,
        kc_idp_hint,
        redirect_uri,
        client_id,
        response_type: responseType,
        state,
      })}`;

      return {
        url,
        state,
      };
    }

    setTokenStorage(tokenStorage) {
      this.tokenStorage = tokenStorage;
    }
}