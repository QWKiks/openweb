/**
 * Extension Management Tool
 * Enable, disable, or list installed Chrome extensions.
 */

export class ExtensionTool {
  name = "extension";

  async execute(args) {
    const { cmd } = args;

    switch (cmd) {
      case "list":
        return this.list(args);
      case "enable":
        return this.enable(args);
      case "disable":
        return this.disable(args);
      case "info":
        return this.info(args);
      default:
        throw new Error(`Unknown extension command: ${cmd}. Use: list, enable, disable, info`);
    }
  }

  async list(args) {
    const { type } = args; // optional filter: "extension", "theme", "hosted_app", etc.
    let extensions;
    if (type) {
      extensions = await chrome.management.getAll();
      extensions = extensions.filter((e) => e.type === type);
    } else {
      extensions = await chrome.management.getAll();
    }
    // Exclude self
    const selfId = chrome.runtime.id;
    const filtered = extensions
      .filter((e) => e.id !== selfId)
      .map((e) => ({
        id: e.id,
        name: e.name,
        description: (e.description || "").slice(0, 100),
        type: e.type,
        enabled: e.enabled,
        version: e.version,
        mayDisable: e.mayDisable,
      }));
    return { success: true, extensions: filtered };
  }

  async enable(args) {
    const { id } = args;
    if (!id) throw new Error("id is required for enable");
    await chrome.management.setEnabled(id, true);
    return { success: true, id, enabled: true };
  }

  async disable(args) {
    const { id } = args;
    if (!id) throw new Error("id is required for disable");
    // Prevent disabling self
    if (id === chrome.runtime.id) {
      throw new Error("Cannot disable the OpenWeb extension itself");
    }
    await chrome.management.setEnabled(id, false);
    return { success: true, id, enabled: false };
  }

  async info(args) {
    const { id } = args;
    if (!id) throw new Error("id is required for info");
    const ext = await chrome.management.get(id);
    return {
      success: true,
      extension: {
        id: ext.id,
        name: ext.name,
        description: ext.description || "",
        version: ext.version,
        type: ext.type,
        enabled: ext.enabled,
        mayDisable: ext.mayDisable,
        homepageUrl: ext.homepageUrl || "",
        optionsUrl: ext.optionsUrl || "",
        permissions: ext.permissions || [],
        hostPermissions: ext.hostPermissions || [],
        installType: ext.installType,
      },
    };
  }
}
