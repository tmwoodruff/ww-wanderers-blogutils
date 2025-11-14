import {workspace} from "vscode";

export interface Config {
    s3EndpointUrl: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
    imagesBucket: string
    imagesPrefix: string
    publicUrlBase: string
    imageSizeMax: number
    previewImageBaseNameFormat: string
    previewImageHeight: number
}

let _cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (_cachedConfig) {
    return _cachedConfig;
  }

  const configData = workspace.getConfiguration("ww-wanderers-blogutils");

  const config: Config = {
    s3EndpointUrl: configData.get<string>("s3EndpointUrl", ""),
    region: configData.get<string>("region", "auto"),
    accessKeyId: configData.get<string>("accessKeyId", ""),
    secretAccessKey: configData.get<string>("secretAccessKey", ""),
    forcePathStyle: configData.get<boolean>("forcePathStyle", true),
    imagesBucket: configData.get<string>("imagesBucket", "ww-wanderers-assets-cyokuifedvc"),
    imagesPrefix: configData.get<string>("imagesPrefix", "images/"),
    publicUrlBase: configData.get<string>("publicUrlBase", "https://assets.ww-wanderers.cc"),
    imageSizeMax: configData.get<number>("imageSizeMax", 2048),
    previewImageBaseNameFormat: configData.get<string>("previewImageBaseNameFormat", "%s-240"),
    previewImageHeight: configData.get<number>("previewImageHeight", 480)
  };

  return config;
}

workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration("ww-wanderers-blogutils")) {
    _cachedConfig = null;
  }
});
