import Catalog from "./lib/Catalog";
import AddAssetsToProject from "./lib/nodes/AddAssetsToProject";
import CreateGraphic from "./lib/nodes/CreateGraphic";
import CreateOgrafLink from "./lib/nodes/CreateOgrafLink";
import CreateVggProject from "./lib/nodes/CreateVggProject";
import DownloadHighresFile from "./lib/nodes/DownloadHighresFile";
import DownloadProxyFile from "./lib/nodes/DownloadProxyFile";
import ListTemplates from "./lib/nodes/ListTemplates";
import UploadMogrt from "./lib/nodes/UploadMogrt";

export default new Catalog(
    "Vulcano",
    "Create graphics from templates and manage assets, projects and files in Vulcano",
    "https://raw.githubusercontent.com/moovit-sp-gmbh/vulcano-wave-nodes/main/assets/vulcano-logo.png",
    "2.0.1",
    CreateGraphic,
    AddAssetsToProject,
    ListTemplates,
    DownloadHighresFile,
    DownloadProxyFile,
    UploadMogrt,
    CreateVggProject,
    CreateOgrafLink
);
