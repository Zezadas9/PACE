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
  UnimplementedAuthPort, WebGeolocationPort, WebNetworkPort, WebNotificationsPort,
} from './web/capabilities';
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
  };
}

export async function createPlatform(): Promise<Platform> {
  return createWebPlatform();
}

export * from './types';
