import { getConfig } from "./config";
import { listKeys, listDirectories } from "./s3";


export async function listImages(folder: string) {
    const config = getConfig();
    const escapedPreviewPattern = config.previewImageBaseNameFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const previewPattern = new RegExp(escapedPreviewPattern.replace("%s", ".*"));
    const keys = await listKeys(config.imagesBucket, `${config.imagesPrefix}${folder}/`, 20000);
    const images = keys
        .map(k => k.substring(k.lastIndexOf("/") + 1))
        .filter(k => k.endsWith(".webp") && !previewPattern.test(k))
        .map(k => k.substring(0, k.length - 5))
        .sort();
    return images;
}

const FOLDER_PATTERN = /^.*\/([^/]+)\/$/;

export async function listFolders(): Promise<string[]> {
    const config = getConfig();
    const dirKeys = await listDirectories(config.imagesBucket, config.imagesPrefix);
    return dirKeys.map(k => k.replace(FOLDER_PATTERN, "$1"));
}

export function getImagePreviewUrl(folder: string, image: string) {
    const config = getConfig();
    image = config.previewImageBaseNameFormat.replaceAll("%s", image);
    return `${config.publicUrlBase}/${config.imagesPrefix}${folder}/${image}.webp`;
}
