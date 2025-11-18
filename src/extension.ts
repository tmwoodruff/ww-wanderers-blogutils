import * as vscode from 'vscode';
import { ImagesView } from './tree/images_tree';
import blogImagePlugin from './markdown-it-blog-image';
import { initialize_image_cache } from './images';

export async function activate(context: vscode.ExtensionContext) {
  await initialize_image_cache(context);

  new ImagesView(context);

  return {
    extendMarkdownIt(md: any) {
      return md.use(blogImagePlugin);
    }
  };
}

export function deactivate() { }
