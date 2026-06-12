// @license SPDX-License-Identifier: Apache-2.0
//
// background.js — service worker. Adds a right-click "Save to Wayfold" on a selection/page, which
// runs the same clip flow as the popup. Kept thin: all capture logic lives in clip.js (one source).
import { clipActiveTab } from './clip.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wayfold-save',
    title: 'Save to Wayfold',
    contexts: ['selection', 'page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'wayfold-save') return;
  const r = await clipActiveTab();
  const n = (r.bookings?.length || 0) + (r.suggestion?.itemsToAdd?.length || r.candidates?.length || 0);
  chrome.action.setBadgeText({ tabId: tab?.id, text: r.error ? '!' : String(n || '') });
  chrome.action.setBadgeBackgroundColor({ color: r.error ? '#d32f2f' : '#1565c0' });
});
