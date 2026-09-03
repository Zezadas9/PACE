/**
 * PACE — Platform resolver.
 *
 * The single place that decides which implementation of each port the app gets.
 * Today there is one branch: web. Adding native is adding a second branch here
 * and a folder of implementations — no feature code moves.
 *
 * When Capacitor lands:
 *
 *   import { Capacitor } from '@capacitor/core';
 *
 *   export async function createPlatform(): Promise<Platform> {
 *     return Capacitor.isNativePlatform()
 *       ? createCapacitorPlatform()
 *       : createWebPlatform();
 *   }
 *
 * Detection stays here so nothing else has to import a plugin to ask what it is
 * running on.
 */

import { WebDevicePort } from './web/device';
import { createWebStoragePort } from './web/storage';
import {
  UnavailableBackgroundPort, UnavailableHealthPort, UnavailableSensorPort,
  UnimplementedAuthPort, WebGeolocationPort, WebNetworkPort,
} from './web/capabilities';
import { WebNotificationsPort } from './web/notifications';
import { LocalAssistantPort } from './web/assistant';
import { RemoteAssistantPort, withLocalFallback } from './web/remoteAssistant';
import type { Platform } from './types';

export async function createWebPlatform(): Promise<Platform> {
  const device = new WebDevicePort();
  return {
    info: await device.getInfo(),
    storage: createWebStoragePort(),
    device,
    notifications: new WebNotificationsPort(),
    geolocation: new WebGeolocationPort(),
    background: new UnavailableBackgroundPort(),
    health: new UnavailableHealthPort(),
    sensors: new UnavailableSensorPort(),
    network: new WebNetworkPort(),
    auth: new UnimplementedAuthPort(),
    assistant: createAssistant(),
  };
}

/**
 * O assistente que a aplicação vai usar.
 *
 * Com `VITE_PACE_API_URL` definido, fala com o Worker e tem o motor local por
 * baixo. Sem ele — que é o caso de quem clona o repositório e corre o `dev` —
 * fica só o motor local, que responde a tudo sem rede nenhuma.
 *
 * A variável é um URL público, não um segredo: é o endereço do backend, e a
 * chave da API vive lá dentro.
 */
function createAssistant(): Platform['assistant'] {
  const local = new LocalAssistantPort();
  const url = import.meta.env.VITE_PACE_API_URL?.trim();
  if (!url) return local;
  return withLocalFallback(new RemoteAssistantPort(url), local);
}

export async function createPlatform(): Promise<Platform> {
  return createWebPlatform();
}

export * from './types';
