let windowId = null;

chrome.windows.getCurrent((window) => {
    windowId = window.id;
    chrome.tabs.query({windowId: window.id, active: true}, (tabs) => {
        const selectedTab = tabs[0];
        if (selectedTab && selectedTab.url.indexOf('chrome://') === -1) {
            chrome.tabs.insertCSS(selectedTab.id, {file: "jiraTimer.css"});
            chrome.tabs.executeScript(selectedTab.id, {file: "jiraTimer.js"});
        }
    });
});

chrome.windows.onFocusChanged.addListener((windowChangeId) => {
    if (windowChangeId && windowChangeId > -1){
        windowId = windowChangeId;
        chrome.tabs.query({active: true, windowId: windowId}, (tabs) => {
            const selectedTab = tabs[0];
            bg.onTabUpdated(selectedTab.id);
        })
    }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.method){
        bg[request.method](request);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    bg.onTabUpdated(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    bg.onTabUpdated(tabId);
});

// background script methods;
let bg = {
    focusOrNavigateToTab: (req) => {
        chrome.tabs.query({windowId: windowId},(tabs) => {
            tabs = $.grep(tabs, (tab) => {
                return tab.url.replace('#','') === req.url.replace('#','');
            });
            if (tabs.length === 1){
                // if tab(s) exists with desired url, set focus to first available one
                chrome.tabs.update(tabs[0].id, {selected: true});
            } else {
                // otherwise create new tab and change focus
                chrome.tabs.create({url: req.url, active: true}, () => {});
            }
        });
    },
    onTabUpdated: (tabId) => {
        chrome.tabs.get(tabId, (tabInfo) => {
            const isJiraPage = tabInfo.url.indexOf('https://jira.') > -1 && tabInfo.url.indexOf('/browse/') > -1;
            const jiraTicketName = isJiraPage ? tabInfo.title.substr(1, tabInfo.title.indexOf(']') - 1) : 'NA';
            if (isJiraPage) {
                chrome.storage.local.get((res) => {
                    const keys = Object.keys(res);
                    const setClass = keys.indexOf(jiraTicketName) > -1 ? 'active' : 'inactive';
                    bg.sendBackgroundMessage({method: 'updateStatusImage', setClass: setClass});
                });
            }
        });
    },
    storeTicketInfo: (req) => {
        chrome.tabs.query({windowId: windowId, active: true}, (tabs) => {
            let save = {};
            const selectedTab = tabs[0];
            if (selectedTab) {
                const jiraTicketName = selectedTab.title.substr(1, selectedTab.title.indexOf(']') - 1);

                if (req.action === 'start') {
                    save[jiraTicketName] = {start: moment.now(), tabId: selectedTab.id, url: selectedTab.url};
                    chrome.storage.local.set(save, () => {});
                } else {
                    chrome.storage.local.get(jiraTicketName, (ticketRes) => {
                        const end = (Object.values(ticketRes)[0] && Object.values(ticketRes)[0].end) ? Object.values(ticketRes)[0]['end'] : moment.now();
                        const start = Object.values(ticketRes)[0].start;
                        bg.sendBackgroundMessage({method: 'logWork', start: start, end: end, ticketName: jiraTicketName});
                    });
                }
            }
        });
    },
    sendBackgroundMessage: (options) => {
        options['from'] = 'background';
        chrome.tabs.query({active: true, windowId: windowId}, (tabs) => {
            const selectedTab = tabs[0];
            if (selectedTab) {
                chrome.tabs.sendMessage(selectedTab.id, options, (response) => {});
            }
        });
    },
    updateIcon: (req, tabId) => {
        const iconName = req.action === 'stop' ? 'inactive_19.png' : 'active_19.png';
        if (tabId) {
            chrome.browserAction.setIcon({path: iconName, tabId: tabId});
        } else {
            chrome.tabs.query({windowId: windowId, active: true}, (tabs) => {
                const selectedTab = tabs[0];
                if (selectedTab) {
                    chrome.browserAction.setIcon({ path: iconName });
                }
            });
        }
    }
}

goToJiraTimer = (goToBoard = false) => {
  chrome.storage.local.get((res) => {
    const keys = $.grep(Object.keys(res), (el) => {
      return el.indexOf('-') > -1;
    });
    if (keys.length === 0 || goToBoard) {
      const regex = /\w(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im;
      const manifestURLMatch = chrome.runtime.getManifest().content_scripts[0].matches[0];
      let m;
      if ((m = regex.exec(manifestURLMatch)) !== null) {
        chrome.tabs.create({url: `https://${m[0]}`, active: true}, () => {});
      }
    } else {
      chrome.tabs.create({url: res[keys[0]].url, active: true}, () => {});
    }
  });
}

let hasAddedContextMenus = false;

if (!hasAddedContextMenus){
    hasAddedContextMenus = true;
    chrome.contextMenus.create({ title: 'Go To Jira Timer', id: 'goToJiraTimer', contexts: ['browser_action']});
    chrome.contextMenus.create({ title: 'Go To Jira', id: 'goToJira', contexts: ['browser_action'] });
}


chrome.contextMenus.onClicked.addListener((obj) => {
  if (obj.menuItemId === 'goToJiraTimer') {
    goToJiraTimer();
  }
  if (obj.menuItemId === 'goToJira') {
    goToJiraTimer(true);
  }
});
chrome.browserAction.onClicked.addListener((obj) => {
  goToJiraTimer();
});

