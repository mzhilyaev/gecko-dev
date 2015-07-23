/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cu = Components.utils;

this.EXPORTED_SYMBOLS = [ "AboutNewTab" ];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "RemotePages",
  "resource://gre/modules/RemotePageManager.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NewTabUtils",
  "resource://gre/modules/NewTabUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "BackgroundPageThumbs",
  "resource://gre/modules/BackgroundPageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs",
  "resource://gre/modules/PageThumbs.jsm");

let AboutNewTab = {

  pageListener: null,

  init: function() {
    this.pageListener = new RemotePages("about:newtab");
    this.pageListener.addMessageListener("NewTab:Customize", this.customize.bind(this));
    this.pageListener.addMessageListener("NewTab:InitializeGrid", this.initializeGrid.bind(this));
    this.pageListener.addMessageListener("NewTab:UpdateGrid", this.updateGrid.bind(this));
    this.pageListener.addMessageListener("NewTab:PinLink", this.pinLink.bind(this));
    this.pageListener.addMessageListener("NewTab:UnpinLink", this.unpinLink.bind(this));
    this.pageListener.addMessageListener("NewTab:ReplacePinLink", this.replacePinLink.bind(this));
    this.pageListener.addMessageListener("NewTab:BlockLink", this.block.bind(this));
    this.pageListener.addMessageListener("NewTab:UnblockLink", this.unblock.bind(this));
    this.pageListener.addMessageListener("NewTab:UndoAll", this.undoAll.bind(this));
    this.pageListener.addMessageListener("NewTab:GetPinnedRange", this.pinRange.bind(this));
    this.pageListener.addMessageListener("NewTab:BackgroundPageThumbs", this.backgroundPageThumbs.bind(this));
    this.pageListener.addMessageListener("NewTab:PageThumbs", this.pageThumbs.bind(this));
    this.pageListener.addMessageListener("NewTab:IntroPrefs", this.updateIntroPrefs.bind(this));

    this._addObservers();

  },

  customize: function(message) {
    NewTabUtils.allPages.enabled = message.data.enabled;
    NewTabUtils.allPages.enhanced = message.data.enhanced;
  },

  initializeGrid: function(message) {
    NewTabUtils.links.populateCache(() => {
      let links = NewTabUtils.links.getLinks().filter((link) => NewTabUtils.linkChecker.checkLoadURI(link.url));
      message.target.sendAsyncMessage("NewTab:FetchLinks", {links: links});
    });
  },

  updateGrid: function(message) {
    message.target.sendAsyncMessage("NewTab:FetchLinks", {links: NewTabUtils.links.getLinks()});
  },

  pinLink: function(message) {
    let link = message.data.link;
    let index = message.data.index;
    this.windowID = message.data.windowID;
    NewTabUtils.pinnedLinks.pin(link, index);
    message.target.sendAsyncMessage("NewTab:PinState", {pinState: NewTabUtils.pinnedLinks.links[index].pinState, link: link});

    if (message.data.ensureUnblocked) {
      this.unblock(message);
    }
    this.updatePages(message);
  },

  unpinLink: function(message) {
    let link = message.data.link;
    NewTabUtils.pinnedLinks.unpin(link);
    message.target.sendAsyncMessage("NewTab:PinState", {pinState: link.pinState, link: link});
    this.updatePages(message);
  },

  replacePinLink: function(message) {
    let oldUrl = message.data.oldUrl;
    let link = message.data.link;
    NewTabUtils.pinnedLinks.replace(oldUrl, link);
  },

  pinRange: function(message) {
    message.target.sendAsyncMessage("NewTab:FetchLinks", {links: NewTabUtils.links.getLinks()});
  },

  block: function(message) {
    let link = message.data.link;
    NewTabUtils.blockedLinks.block(link);
    message.target.sendAsyncMessage("NewTab:BlockState", {blockState: NewTabUtils.blockedLinks.isBlocked(message.data.link), link: link});
    this.updatePages(message);
  },

  unblock: function(message) {
    if (message.data.pinned) {
      this.pinLink(message);
    }

    let link = message.data.link;
    NewTabUtils.blockedLinks.unblock(link);
    message.target.sendAsyncMessage("NewTab:BlockState", {blockState: NewTabUtils.blockedLinks.isBlocked(message.data.link), link: link});
    this.updatePages(message);
  },

  undoAll: function(message) {
    NewTabUtils.undoAll(function() {
      message.target.sendAsyncMessage("NewTab:Restore");
      this.updatePages(message);
    }.bind(this));
  },

  backgroundPageThumbs: function(message) {
    BackgroundPageThumbs.captureIfMissing(message.data.url);
  },

  pageThumbs: function(message) {
    let uri = PageThumbs.getThumbnailURL(message.data.url);
    let enhanced = Services.prefs.getBoolPref("browser.newtabpage.enhanced");
    message.target.sendAsyncMessage("NewTab:URI", {uri: uri, enhanced: enhanced});
  },

  updatePages: function(message) {
    let tabbrowser = message.target.browser.getTabBrowser();
    let outerWindowID = tabbrowser ? tabbrowser.selectedBrowser.outerWindowID : null;
    this.pageListener.sendAsyncMessage("NewTab:UpdatePages", {links: NewTabUtils.links.getLinks(), outerWindowID: outerWindowID});
  },

  updateIntroPrefs: function(message) {
    Services.prefs.setBoolPref("browser.newtabpage.introShown", message.data.introShown);
    Services.prefs.setBoolPref("browser.newtabpage.updateIntroShown", message.data.updateIntroShown);
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      switch (aData) {
        case "browser.newtabpage.enabled":
          NewTabUtils.allPages._enabled = null;
          break;
        case "browser.newtabpage.enhanced":
          NewTabUtils.allPages._enhanced = null;
          break;
      }
    } else if (aTopic == "browser:purge-session-history") {
        NewTabUtils.links.resetCache();
    }
    this.pageListener.sendAsyncMessage("NewTab:Observe", {topic: aTopic, data: aData});
    this.updatePages();
  },

  _addObservers: function() {
    Services.prefs.addObserver("browser.newtabpage.enabled", this, true);
    Services.prefs.addObserver("browser.newtabpage.enhanced", this, true);
    Services.prefs.addObserver("browser.newtabpage.rows", this, true);
    Services.prefs.addObserver("browser.newtabpage.columns", this, true);
    Services.obs.addObserver(this, "page-thumbnail:create", true);
    Services.obs.addObserver(this, "browser:purge-session-history", true);
  },

  _removeObservers: function() {
    Services.prefs.removeObserver("browser.newtabpage.enabled", this);
    Services.prefs.removeObserver("browser.newtabpage.enhanced", this);
    Services.prefs.removeObserver("browser.newtabpage.rows", this);
    Services.prefs.removeObserver("browser.newtabpage.columns", this);
    Services.obs.removeObserver(this, "page-thumbnail:create");
    Services.obs.removeObserver(this, "browser:purge-session-history");
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  uninit: function() {
    this._removeObservers();
    this.pageListener.destroy();
    this.pageListener = null;
  },
};
