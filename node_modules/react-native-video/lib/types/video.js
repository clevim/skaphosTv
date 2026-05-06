export var DRMType;
(function (DRMType) {
    DRMType["WIDEVINE"] = "widevine";
    DRMType["PLAYREADY"] = "playready";
    DRMType["CLEARKEY"] = "clearkey";
    DRMType["FAIRPLAY"] = "fairplay";
})(DRMType || (DRMType = {}));
export var SelectedTrackType;
(function (SelectedTrackType) {
    SelectedTrackType["SYSTEM"] = "system";
    SelectedTrackType["DISABLED"] = "disabled";
    SelectedTrackType["TITLE"] = "title";
    SelectedTrackType["LANGUAGE"] = "language";
    SelectedTrackType["INDEX"] = "index";
})(SelectedTrackType || (SelectedTrackType = {}));
export var SelectedVideoTrackType;
(function (SelectedVideoTrackType) {
    SelectedVideoTrackType["AUTO"] = "auto";
    SelectedVideoTrackType["DISABLED"] = "disabled";
    SelectedVideoTrackType["RESOLUTION"] = "resolution";
    SelectedVideoTrackType["INDEX"] = "index";
})(SelectedVideoTrackType || (SelectedVideoTrackType = {}));
export var TextTracksType;
(function (TextTracksType) {
    TextTracksType["SUBRIP"] = "application/x-subrip";
    TextTracksType["TTML"] = "application/ttml+xml";
    TextTracksType["VTT"] = "text/vtt";
})(TextTracksType || (TextTracksType = {}));
export var FullscreenOrientationType;
(function (FullscreenOrientationType) {
    FullscreenOrientationType["ALL"] = "all";
    FullscreenOrientationType["LANDSCAPE"] = "landscape";
    FullscreenOrientationType["PORTRAIT"] = "portrait";
})(FullscreenOrientationType || (FullscreenOrientationType = {}));
export var IgnoreSilentSwitchType;
(function (IgnoreSilentSwitchType) {
    IgnoreSilentSwitchType["INHERIT"] = "inherit";
    IgnoreSilentSwitchType["IGNORE"] = "ignore";
    IgnoreSilentSwitchType["OBEY"] = "obey";
})(IgnoreSilentSwitchType || (IgnoreSilentSwitchType = {}));
export var MixWithOthersType;
(function (MixWithOthersType) {
    MixWithOthersType["INHERIT"] = "inherit";
    MixWithOthersType["MIX"] = "mix";
    MixWithOthersType["DUCK"] = "duck";
})(MixWithOthersType || (MixWithOthersType = {}));
export var PosterResizeModeType;
(function (PosterResizeModeType) {
    PosterResizeModeType["CONTAIN"] = "contain";
    PosterResizeModeType["CENTER"] = "center";
    PosterResizeModeType["COVER"] = "cover";
    PosterResizeModeType["NONE"] = "none";
    PosterResizeModeType["REPEAT"] = "repeat";
    PosterResizeModeType["STRETCH"] = "stretch";
})(PosterResizeModeType || (PosterResizeModeType = {}));
//# sourceMappingURL=video.js.map