var windowId = null;

chrome.windows.getCurrent(function (window) {
    windowId = window.id;
    chrome.tabs.query({windowId: window.id, active: true}, function (tabs) {
        var selectedTab = tabs[0];
        if (selectedTab && selectedTab.url.indexOf('chrome://') === -1) {
            chrome.tabs.insertCSS(selectedTab.id, {file: "jiraTimer.css"});
            chrome.tabs.executeScript(selectedTab.id, {file: "jiraTimer.js"});
        }
    });
});

chrome.windows.onFocusChanged.addListener(function (windowChangeId) {
    if (windowChangeId && windowChangeId > -1){
        windowId = windowChangeId;
        chrome.tabs.query({active: true, windowId: windowId}, function (tabs) {
            var selectedTab = tabs[0];
            bg.onTabUpdated(selectedTab.id);
        })
    }
})

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.method){
        bg[request.method](request);
    }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    bg.onTabUpdated(activeInfo.tabId);
})

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    bg.onTabUpdated(tabId);
});

// background script methods;
var bg = {
    focusOrNavigateToTab: function(req) {
        chrome.tabs.query({windowId: windowId}, function(tabs){
            tabs = $.grep(tabs, function (tab) {
                return tab.url === req.url.replace('#','');
            });
            if (tabs.length === 1){
                // if tab(s) exists with desired url, set focus to first available one
                chrome.tabs.update(tabs[0].id, {selected: true});
            } else {
                // otherwise create new tab and change focus
                chrome.tabs.create({url: req.url, active: true}, function(){});
            }
        });
    },
    onTabUpdated: function(tabId) {
        chrome.tabs.get(tabId, function (tabInfo) {
            var isJiraPage = tabInfo.url.indexOf('https://jira.') > -1 && tabInfo.url.indexOf('/browse/') > -1;
            var jiraTicketName = isJiraPage ? tabInfo.title.substr(1, tabInfo.title.indexOf(']') - 1) : 'NA';
            if (isJiraPage) {
                chrome.storage.local.get(function (res) {
                    var keys = Object.keys(res);
                    var setClass = keys.indexOf(jiraTicketName) > -1 ? 'active' : 'inactive';
                    bg.sendBackgroundMessage({method: 'updateStatusImage', setClass: setClass});
                });
            }
        });
    },
    storeTicketInfo: function(req) {
        chrome.tabs.query({windowId: windowId, active: true}, function (tabs) {
            var save = {};
            var selectedTab = tabs[0];
            if (selectedTab) {
                var jiraTicketName = selectedTab.title.substr(1, selectedTab.title.indexOf(']') - 1);

                if (req.action === 'start') {
                    save[jiraTicketName] = {start: moment.now(), tabId: selectedTab.id, url: selectedTab.url};
                    chrome.storage.local.set(save, function () {});
                } else {
                    chrome.storage.local.get(jiraTicketName, function (ticketRes) {
                        var end = (Object.values(ticketRes)[0] && Object.values(ticketRes)[0].end) ? Object.values(ticketRes)[0]['end'] : moment.now();
                        var start = Object.values(ticketRes)[0].start;
                        bg.sendBackgroundMessage({method: 'logWork', start: start, end: end, ticketName: jiraTicketName});
                    });
                }
            }
        });
    },
    sendBackgroundMessage: function(options) {
        options['from'] = 'background';
        chrome.tabs.query({active: true, windowId: windowId}, function (tabs) {
            var selectedTab = tabs[0];
            if (selectedTab) {
                chrome.tabs.sendMessage(selectedTab.id, options, function (response) {});
            }
        });
    },
    updateIcon: function(req, tabId) {
        var iconName = req.action === 'stop' ? 'inactive_19.png' : 'active_19.png';
        if (tabId) {
            chrome.browserAction.setIcon({path: iconName, tabId: tabId});
        } else {
            chrome.tabs.query({windowId: windowId, active: true}, function (tabs) {
                var selectedTab = tabs[0];
                if (selectedTab) {
                    chrome.browserAction.setIcon({path: iconName, tabId: selectedTab.id});
                }
            });
        }
    }

}



