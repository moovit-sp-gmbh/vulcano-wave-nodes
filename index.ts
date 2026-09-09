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
    "https://app.helmut.cloud/img/logo_white.webp",
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
