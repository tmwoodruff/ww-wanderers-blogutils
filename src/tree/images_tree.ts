import * as vscode from 'vscode';
import { getImageMarkdown, getImagePreviewUrl, getImageUrl, ImageInfo, listFolders, listImages, uploadImages } from "../images";
import { writeObject } from '../s3';
import { getConfig } from '../config';

const FOLDER_ENTRY: ImageInfo = { name: "__FOLDER__", filename: "" };

export class ImagesProvider implements vscode.TreeDataProvider<ImageInfo>, vscode.TreeDragAndDropController<ImageInfo> {
  folder?: string;
  private images?: ImageInfo[];

  dropMimeTypes: readonly string[] = ["text/uri-list"];
  dragMimeTypes: readonly string[] = ["text/uri-list"];

  private _onDidChangeTreeData: vscode.EventEmitter<ImageInfo | undefined | null | void> =
    new vscode.EventEmitter<ImageInfo | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ImageInfo | undefined | null | void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this.images = undefined;
    this._onDidChangeTreeData.fire();
  }
  setFolder(folder: string): void {
    if (folder !== this.folder) {
      this.folder = folder;
      this.refresh();
    }
  }
  getTreeItem(element: ImageInfo): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (element === FOLDER_ENTRY) {
      const item = new vscode.TreeItem(
        this.folder ?? "<No folder selected>",
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    } else {
      const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
      item.iconPath = vscode.ThemeIcon.File;
      // if (this.folder) {
      //     item.resourceUri = vscode.Uri.parse(getImageUrl(this.folder, element));
      // }
      return item;
    }
  }
  async getChildren(element?: ImageInfo | undefined): Promise<ImageInfo[] | null | undefined> {
    if (!this.folder) {
      return null;
    }
    if (!element) {
      return [FOLDER_ENTRY];
    }
    if (element === FOLDER_ENTRY) {
      if (!this.images) {
        await this._loadImages();
      }
      return this.images;
    }
    return null;
  }
  getParent?(element: ImageInfo): vscode.ProviderResult<ImageInfo> {
    if (element === FOLDER_ENTRY) {
      return null;
    }
    return FOLDER_ENTRY;
  }
  resolveTreeItem?(item: vscode.TreeItem, element: ImageInfo, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
    if (element !== FOLDER_ENTRY && !item.tooltip && this.folder) {
      const url = getImagePreviewUrl(this.folder, element);
      const tooltip = new vscode.MarkdownString(`<img src="${url}" width="100"/>`);
      tooltip.supportHtml = true;
      item.tooltip = tooltip;
    }
    return item;
  }
  async handleDrag?(source: readonly ImageInfo[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    const folder = this.folder;
    if (folder) {
      const markdowns = [];
      for (const image of source) {
        if (image !== FOLDER_ENTRY) {
          markdowns.push(await getImageMarkdown(folder, image));
        }
      }
      dataTransfer.set("text/plain", new vscode.DataTransferItem(markdowns.join("\n")));
    }
  }
  async handleDrop?(target: ImageInfo | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    const folder = this.folder;
    if (!folder) {
      return;
    }
    const dataTransferItem = dataTransfer.get("text/uri-list");
    if (!dataTransferItem) {
      return undefined;
    }
    const uriList = await dataTransferItem.asString();
    if (token.isCancellationRequested) {
      return;
    }
    const imageUris: vscode.Uri[] = [];
    for (const resource of uriList.split('\r\n')) {
      try {
        imageUris.push(vscode.Uri.parse(resource));
      } catch {
        // noop
      }
    }
    await this._uploadImages(imageUris, folder);
  }
  async _uploadImages(imageUris: vscode.Uri[], folder: string) {
    const uploadResults = await uploadImages(folder, imageUris);

    let addedImages: boolean = false;
    const errors: string[] = [];
    for (const res of uploadResults) {
      if (res.status === "SUCCESS") {
        this.images?.push(res.image);
        addedImages = true;
      } else if (res.status === "ERROR") {
        errors.push(`${res.imageUri.path}: ${res.error}`);
      }
    }

    if (addedImages) {
      this.refresh();
    }

    if (errors.length > 0) {
      vscode.window.showErrorMessage("Error uploading images.", ...errors);
    } else {
      vscode.window.showInformationMessage(`Finished uploading images.`);
    }
  }
  async _loadImages() {
    const folder = this.folder;
    if (!folder) {
      this.images = [];
    } else {
      this.images = await listImages(folder);
    }
  }

  async createFolder() {
    const folder_name_pattern = /^[a-zA-Z0-9_.-]+$/;
    const folder = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      placeHolder: "Enter a folder name...",
      validateInput: value => {
        if (!folder_name_pattern.test(value)) {
          return "Folder name should contain only letters, numbers, ., -, or _";
        }
      }
    });

    if (!folder) { return; }

    const config = getConfig();
    await writeObject(config.imagesBucket, `${config.imagesPrefix}${folder}/`, Buffer.alloc(0));

    this.setFolder(folder);
  }

  async addImages() {
    const folder = this.folder;
    if (!folder) {
      vscode.window.showErrorMessage("No folder selected. Cannot add files.");
      return;
    }

    const imageUris = await vscode.window.showOpenDialog({
      canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
      filters: { "Images": ["jpg", "jpeg", "png", "gif", "webp", "avif", "tiff"] }
    });

    if (!imageUris) {
      return;
    }

    await this._uploadImages(imageUris, folder);
  }
}

async function getQuickPickFolders(): Promise<vscode.QuickPickItem[]> {
  return (await listFolders())
    .map(f => ({ label: f, iconPath: vscode.ThemeIcon.Folder }));
}


export class ImagesView {
  constructor(context: vscode.ExtensionContext) {
    const provider = new ImagesProvider();
    const view = vscode.window.createTreeView(
      'ww-wanderers-images',
      { treeDataProvider: provider, canSelectMany: true, dragAndDropController: provider }
    );
    context.subscriptions.push(view);

    vscode.commands.registerCommand("ww-wanderers-blogutils.selectImageFolder", async () => {
      const folder = await vscode.window.showQuickPick(
        getQuickPickFolders(), { placeHolder: "Select an Image Folder...", canPickMany: false }
      );
      if (folder) {
        provider.setFolder(folder.label);
      }
    });

    vscode.commands.registerCommand("ww-wanderers-blogutils.refreshImages", () => { provider.refresh(); });
    vscode.commands.registerCommand("ww-wanderers-blogutils.addImages", async () => { provider.addImages(); });
    vscode.commands.registerCommand("ww-wanderers-blogutils.createImageFolder", async () => {
      provider.createFolder();
    });
  }
}