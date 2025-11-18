import * as vscode from 'vscode';
import { ImagesView } from './tree/images_tree';

export function activate(context: vscode.ExtensionContext) {
	new ImagesView(context);

  return {
    extendMarkdownIt(md: any) {
      return md.use(blogImagePlugin);
    }
  };
}

export function deactivate() {}
