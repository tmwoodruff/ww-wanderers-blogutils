import * as vscode from 'vscode';
import { getImagePreviewUrl, listFolders, listImages } from "../images";

interface ImageEntry {
    name: string;
}

export class ImagesProvider implements vscode.TreeDataProvider<ImageEntry> {
    private folder?: string;
    private images?: ImageEntry[];

    private _onDidChangeTreeData: vscode.EventEmitter<ImageEntry | undefined | null | void> =
        new vscode.EventEmitter<ImageEntry | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ImageEntry | undefined | null | void> =
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
    getTreeItem(element: ImageEntry): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    }
    async getChildren(element?: ImageEntry | undefined): Promise<ImageEntry[] | null | undefined> {
        if (!this.folder) {
            // vscode.window.showInformationMessage('No image folder is set');
            return null;
        }
        if (!this.images) {
            await this._loadImages();
        }
        return this.images;
    }
    getParent?(element: ImageEntry): vscode.ProviderResult<ImageEntry> {
        return null;
    }
    resolveTreeItem?(item: vscode.TreeItem, element: ImageEntry, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        if (!item.tooltip && this.folder) {
            const url = getImagePreviewUrl(this.folder, element.name);
            const tooltip = new vscode.MarkdownString(`<img src="${url}" width="100"/>`);
            tooltip.supportHtml = true;
            item.tooltip = tooltip;
        }
        return item;
    }
    async _loadImages() {
        const folder = this.folder;
        if (!folder) {
            this.images = [];
        } else {
            this.images = (await listImages(folder))
                .map(img => ({ name: img }));
        }
    }
}

async function getQuickPickFolders(): Promise<vscode.QuickPickItem[]> {
    return (await listFolders())
        .map(f => ({ label: f, iconPath: vscode.ThemeIcon.Folder }));
}

export class ImagesView {
    constructor(context: vscode.ExtensionContext) {
        const provider = new ImagesProvider();
        const view = vscode.window.createTreeView('ww-wanderers-images', { treeDataProvider: provider });
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

        vscode.commands.registerCommand("ww-wanderers-blogutils.addImages", async () => {
        });

        vscode.commands.registerCommand("ww-wanderers-blogutils.createImageFolder", async () => {
        });
    }
}