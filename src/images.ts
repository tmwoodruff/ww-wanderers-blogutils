import { Uri, workspace } from "vscode";
import { Config, getConfig } from "./config";
import { listKeys, listDirectories, writeObject } from "./s3";
import sharp from "sharp";


const IMAGE_FILENAME_PATTERN = /^(.*?)(?:\.(\d+x\d+))?\.[^.]+$/;
const FOLDER_PATTERN = /^.*\/([^/]+)\/$/;

export interface ImageInfo {
  filename: string
  name: string;
  size?: string;
}

export async function listImages(folder: string) {
  const config = getConfig();
  const escapedPreviewPattern = config.previewImageBaseNameFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const previewPattern = new RegExp("^.*/" + escapedPreviewPattern.replace("%s", ".*") + "\\.webp$");
  const keys = await listKeys(config.imagesBucket, `${config.imagesPrefix}${folder}/`, 20000);
  const images: ImageInfo[] = keys
    .filter(k => !previewPattern.test(k))
    .map(parseImageInfo)
    .filter(m => !!m)
    .sort((a, b) => a.name.localeCompare(b.name));
  return images;
}

function parseImageInfo(imageFilename: string): ImageInfo | null {
  const m = IMAGE_FILENAME_PATTERN.exec(imageFilename.substring(imageFilename.lastIndexOf("/") + 1));
  if (!m) {
    return null;
  }
  return { filename: m[0], name: m[1], size: m[2] };
}

export async function listFolders(): Promise<string[]> {
  const config = getConfig();
  const dirKeys = await listDirectories(config.imagesBucket, config.imagesPrefix);
  return dirKeys.map(k => k.replace(FOLDER_PATTERN, "$1"));
}

function getImageFilename(name: string, size: string) {
  return `${name}.${size}.webp`;
}

async function getImageSize(folder: string, imageInfo: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  if (imageInfo.size) {
    return imageInfo.size;
  } else {
    const response = await fetch(getImageUrl(folder, imageInfo, config));
    const imageData = await response.arrayBuffer();
    if (imageData) {
      const img = sharp(imageData, { autoOrient: true });
      const metadata = await img.metadata();
      return metadata.width + "x" + metadata.height;
    }
  }
}

export function getImageKey(folder: string, image: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  return `${config.imagesPrefix}${folder}/${image.filename}`;
}

export function getPreviewImageKey(folder: string, image: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  const previewName = config.previewImageBaseNameFormat.replaceAll("%s", image.name);
  return `${config.imagesPrefix}${folder}/${previewName}.webp`;
}

export function getImageUrl(folder: string, image: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  return `${config.publicUrlBase}/${getImageKey(folder, image, config)}`;
}

export function getImagePreviewUrl(folder: string, image: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  return `${config.publicUrlBase}/${getPreviewImageKey(folder, image, config)}`;
}

export async function getImageMarkdown(folder: string, image: ImageInfo, config?: Config) {
  config = config ?? getConfig();
  return `{% image "${getImageUrl(folder, image, config)}", "${await getImageSize(folder, image, config)}" %}`;
}

async function convertImage(imageUri: Uri, config: Config) {
  const imageData = await workspace.fs.readFile(imageUri);
  let image = sharp(imageData, { autoOrient: true });
  const metadata = await image.metadata();
  if (metadata.width > metadata.height) {
    if (metadata.width > config.imageSizeMax) {
      image = image.resize(config.imageSizeMax);
    }
  } else {
    if (metadata.height > config.imageSizeMax) {
      image = image.resize(null, config.imageSizeMax);
    }
  }

  const previewImage = image.clone().resize(null, config.previewImageHeight);

  const imageResult = await image
    .webp({ quality: 75, preset: "photo" })
    .toBuffer({ resolveWithObject: true });
  const previewResult = await previewImage
    .webp({ quality: 75, preset: "photo" })
    .toBuffer({ resolveWithObject: true });

  return {
    image: imageResult.data,
    imageSize: `${imageResult.info.width}x${imageResult.info.height}`,
    preview: previewResult.data,
    previewSize: `${previewResult.info.width}x${previewResult.info.height}`
  };
}

export async function uploadImage(folder: string, imageUri: Uri, config: Config): Promise<ImageInfo> {
  const imageName = parseImageInfo(imageUri.path)?.name;
  if (!imageName) {
    throw Error("Cannot parse image name");
  }
  const converted = await convertImage(imageUri, config);
  const imageInfo: ImageInfo = {
    name: imageName,
    filename: getImageFilename(imageName, converted.imageSize),
    size: converted.imageSize,
  };
  await writeObject(
    config.imagesBucket,
    getImageKey(folder, imageInfo),
    converted.image,
    "image/webp",
    { "image-size": converted.imageSize }
  );
  await writeObject(
    config.imagesBucket,
    getPreviewImageKey(folder, imageInfo),
    converted.preview,
    "image/webp",
    { "image-size": converted.previewSize }
  );
  return imageInfo;
}

interface ImageUploadSuccessResult {
  imageUri: Uri;
  status: "SUCCESS";
  image: ImageInfo;
}

interface ImageUploadErrorResult {
  imageUri: Uri;
  status: "ERROR";
  error: string;
}

export async function uploadImages(
  folder: string, imageUris: Uri[], config?: Config
): Promise<(ImageUploadSuccessResult | ImageUploadErrorResult)[]> {
  config = config ?? getConfig();
  const results: (ImageUploadSuccessResult | ImageUploadErrorResult)[] = [];

  for (const uri of imageUris) {
    try {
      const imageName = await uploadImage(folder, uri, config);
      results.push({ imageUri: uri, status: "SUCCESS", image: imageName });
    } catch (e) {
      results.push({ imageUri: uri, status: "ERROR", error: String(e) });
    }
  }

  return results;
}
