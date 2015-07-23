/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let Cu = Components.utils;
let Ci = Components.interfaces;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/DirectoryLinksProvider.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Rect",
  "resource://gre/modules/Geometry.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "UpdateChannel",
  "resource://gre/modules/UpdateChannel.jsm");


XPCOMUtils.defineLazyGetter(this, "gStringBundle", function() {
  return Services.strings.
    createBundle("chrome://browser/locale/newTab.properties");
});

function newTabString(name, args) {
  let stringName = "newtab." + name;
  if (!args) {
    return gStringBundle.GetStringFromName(stringName);
  }
  return gStringBundle.formatStringFromName(stringName, args, args.length);
}

function inPrivateBrowsingMode() {
  return PrivateBrowsingUtils.isContentWindowPrivate(window);
}

function initRemotePage() {
  // Messages that the iframe sends the browser will be passed onto
  // the privileged parent process
  let iframe = document.getElementById("meep").contentDocument;
  iframe.addEventListener("NewTabCommand", (e) => {
    sendAsyncMessage(e.detail.command, e.detail.data);
  }, false);
}

function registerEvents() {
  // Messages that the privileged parent process sends will be passed
  // onto the iframe
  for (let event of REGISTERED_EVENTS) {
    addMessageListener(event, (message) => {
      let iframe = document.getElementById("meep").contentWindow;
      iframe.postMessage(message, "*");
    });
  }
}

function init() {
  registerEvents();
  initRemotePage();
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const XUL_NAMESPACE = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const TILES_EXPLAIN_LINK = "https://support.mozilla.org/kb/how-do-tiles-work-firefox";
const TILES_INTRO_LINK = "https://www.mozilla.org/firefox/tiles/";
const TILES_PRIVACY_LINK = "https://www.mozilla.org/privacy/";

#include transformations.js
const REGISTERED_EVENTS = ["NewTab:FetchLinks", "NewTab:URI", "NewTab:UpdatePages",
                           "NewTab:Observe", "NewTab:PinState", "NewTab:BlockState",
                           "NewTab:Restore"];

// Everything is loaded. Initialize the New Tab Page.
init();
