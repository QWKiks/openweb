import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class ServiceWorkerTool {
  name = "service_worker";

  async execute(args) {
    const tab = await getActiveTab();
    await attach(tab.id);

    const result = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        return navigator.serviceWorker ? {
          supported: true,
          controller: navigator.serviceWorker.controller ? {
            scriptURL: navigator.serviceWorker.controller.scriptURL,
            state: navigator.serviceWorker.controller.state,
          } : null,
        } : { supported: false };
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });

    if (result.exceptionDetails) throw new Error(`service_worker: ${result.exceptionDetails.text}`);

    const hasSW = !!result.result?.value?.controller;
    if (!hasSW) {
      return { supported: true, registered: false, message: "No active service worker for this page" };
    }

    

    const detailResult = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        return Promise.all([
          navigator.serviceWorker.ready.then(reg => ({
            scope: reg.scope,
            active: !!reg.active,
            installing: !!reg.installing,
            waiting: !!reg.waiting,
            updateViaCache: reg.updateViaCache,
          })),
          navigator.serviceWorker.getRegistrations().then(regs => regs.length),
          'caches' in window ? caches.keys().then(keys => keys) : Promise.resolve([]),
          'PushManager' in window ? navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(sub => sub ? { endpoint: sub.endpoint, expirationTime: sub.expirationTime } : null)) : Promise.resolve(null),
        ]);
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    if (detailResult.exceptionDetails) throw new Error(`service_worker: ${detailResult.exceptionDetails.text}`);
    const [registration, registrationsCount, cacheKeys, pushSubscription] = detailResult.result?.value || [];

    return {
      supported: true,
      registered: true,
      registrationsCount,
      scope: registration?.scope,
      state: {
        active: registration?.active,
        installing: registration?.installing,
        waiting: registration?.waiting,
      },
      scriptURL: result.result?.value?.controller?.scriptURL,
      controllerState: result.result?.value?.controller?.state,
      updateViaCache: registration?.updateViaCache,
      caches: cacheKeys,
      pushSubscription,
    };
  }
}
