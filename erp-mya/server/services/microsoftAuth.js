import * as msal from '@azure/msal-node';
import fs from 'fs-extra';
import path from 'path';

const TOKEN_CACHE_FILE = path.join(process.cwd(), 'token-cache.json');

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/consumers',
  },
  cache: {
    cachePlugin: {
      beforeCacheAccess: async (cacheContext) => {
        if (await fs.pathExists(TOKEN_CACHE_FILE)) {
          const cache = await fs.readFile(TOKEN_CACHE_FILE, 'utf-8');
          cacheContext.tokenCache.deserialize(cache);
        }
      },
      afterCacheAccess: async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
          await fs.writeFile(TOKEN_CACHE_FILE, cacheContext.tokenCache.serialize());
        }
      }
    }
  }
};

const pca = new msal.PublicClientApplication(msalConfig);

export async function obtenerToken() {
  // Intentar obtener token silenciosamente desde cache
  const accounts = await pca.getTokenCache().getAllAccounts();
  
  if (accounts.length > 0) {
    try {
      const response = await pca.acquireTokenSilent({
        account: accounts[0],
        scopes: ['Mail.Read', 'User.Read'],
      });
      return { token: response.accessToken, requiereLogin: false };
    } catch (e) {
      // Token expirado, necesita re-autenticación
    }
  }

  // Si no hay cache, iniciar Device Code Flow
  return { token: null, requiereLogin: true };
}

export async function obtenerTokenDeviceCode() {
  const deviceCodeRequest = {
    deviceCodeCallback: (response) => {
      console.log('\n========================================');
      console.log(`1. Abre: ${response.verificationUri}`);
      console.log(`2. Ingresa el código: ${response.userCode}`);
      console.log('========================================\n');
    },
    scopes: ['Mail.Read', 'User.Read'],
  };

  const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  return response.accessToken;
}