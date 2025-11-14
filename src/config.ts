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
    previewImageBaseNameFormat: string
    previewImageHeight: number
}

export function getConfig(): Config {
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
    previewImageBaseNameFormat: configData.get<string>("previewImageBaseNameFormat", "%s-240"),
    previewImageHeight: configData.get<number>("previewImageHeight", 480)
  };

  return config;
}
