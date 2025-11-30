import MarkdownIt from 'markdown-it';
import { getImagePreviewUrl, parseImageInfo } from './images';

// Process {% image "src" ... %}

const BLOG_IMAGE_RE = /\{%\s*image\s*"([^"]+)".*?%\}/; 
const IMAGE_FILENAME_PATTERN = /^(.*?)(?:\.(\d+x\d+))?\.[^.]+$/;

function blogImage (state: MarkdownIt.StateInline, silent: boolean) {
  if (silent) { return false; } // don't run in validation mode

  const start = state.pos;
  const max = state.posMax;

  if (start + 9 >= max) { return false; }
  if (state.src.charAt(start) !== "{" || state.src.charAt(start + 1) !== "%") {
    return false;
  }

  const m = BLOG_IMAGE_RE.exec(state.src.slice(start, max));
  if (!m) {
    return false;
  }

  const src = m[1];
  const slashIdx = src.lastIndexOf("/");
  const filename = decodeURI(src.slice(slashIdx + 1));
  const folder = src.slice(0, slashIdx).replace(/.*\//, "");
  const imageInfo = parseImageInfo(filename);
  if (!imageInfo) {
    return false;
  }

  const previewUrl = getImagePreviewUrl(folder, imageInfo);

  const token = state.push('image', 'img', 0);
  const attrs: [string, string][] = [
    ['src', previewUrl],
    ['alt', ''],
    ['title', imageInfo.name],
    ['height', '240']
  ];
  token.attrs = attrs;
  token.children = [];
  token.content = "";

  state.pos += m[0].length;
  state.posMax = max;
  
  return true;
}

export default function blog_image_plugin(md: MarkdownIt) {
  md.inline.ruler.after('image', 'blog-image', blogImage);
};