/**
 * Bookmark Tool
 * CRUD operations for Chrome bookmarks.
 */

export class BookmarkTool {
  name = "bookmark";

  async execute(args) {
    const { cmd } = args;

    switch (cmd) {
      case "list":
        return this.list(args);
      case "create":
        return this.create(args);
      case "update":
        return this.update(args);
      case "delete":
        return this.delete(args);
      case "search":
        return this.search(args);
      default:
        throw new Error(`Unknown bookmark command: ${cmd}. Use: list, create, update, delete, search`);
    }
  }

  async list(args) {
    const { parentId } = args;
    const nodes = parentId
      ? await chrome.bookmarks.getChildren(parentId)
      : await chrome.bookmarks.getTree();
    return { success: true, bookmarks: this.simplify(nodes) };
  }

  async create(args) {
    const { parentId, title, url, index } = args;
    if (!parentId && !url) {
      throw new Error("parentId or url is required for create");
    }
    const bookmark = await chrome.bookmarks.create({
      parentId: parentId || "1", // Default to Bookmarks Bar
      title: title || "",
      url: url || undefined,
      index: index != null ? index : undefined,
    });
    return { success: true, bookmark: this.simplifyOne(bookmark) };
  }

  async update(args) {
    const { id, title, url } = args;
    if (!id) throw new Error("id is required for update");
    const bookmark = await chrome.bookmarks.update(id, {
      title: title || undefined,
      url: url || undefined,
    });
    return { success: true, bookmark: this.simplifyOne(bookmark) };
  }

  async delete(args) {
    const { id } = args;
    if (!id) throw new Error("id is required for delete");
    await chrome.bookmarks.remove(id);
    return { success: true };
  }

  async search(args) {
    const { query } = args;
    if (!query) throw new Error("query is required for search");
    const results = await chrome.bookmarks.search(query);
    return { success: true, bookmarks: this.simplify(results) };
  }

  simplify(nodes) {
    if (!Array.isArray(nodes)) return this.simplifyOne(nodes);
    return nodes.map((n) => this.simplifyOne(n));
  }

  simplifyOne(node) {
    const result = {
      id: node.id,
      title: node.title || "",
    };
    if (node.url) {
      result.url = node.url;
      result.type = "bookmark";
    } else {
      result.type = "folder";
    }
    if (node.children && node.children.length > 0) {
      result.children = node.children.map((c) => this.simplifyOne(c));
    }
    return result;
  }
}
