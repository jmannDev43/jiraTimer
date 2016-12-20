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

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'start' || request.action === 'stop') {
        updateIcon(request.action);
        storeTicketInfo(request.action);
    } else if (request.action === 'focusOrNavigateToTab'){
        focusOrNavigateToTab(request.url);
    }
});

// chrome.tabs.onActivated.addListener(function (tabInfo) {
//     tabUpdateOrActivate(tabInfo.tabId, 'activated');
// });

// don't think I need to call same code from tabs.onActivated...but if I do, get tabId like so: var tabId = Object.values(res).tabId;
chrome.tabs.onUpdated.addListener(function (tabId) {
    tabUpdateOrActivate(tabId, 'updated');
});

function focusOrNavigateToTab(url) {
    chrome.tabs.query({}, function(tabs){
        tabs = $.grep(tabs, function (tab) {
           return tab.url === url;
        });
        if (tabs.length === 1){
            // if tab(s) exists with desired url, set focus to first available one
            chrome.tabs.update(tabs[0].id, {selected: true});
        } else {
            // otherwise create new tab and change focus
            chrome.tabs.create({url: url, active: true}, function(){});
        }
    });
}

function tabUpdateOrActivate(tabId, eventType) {
    chrome.tabs.get(tabId, function (tabInfo) {
        var isJiraPage = tabInfo.url.indexOf('jira.ties.k12.mn.us/browse/') > -1;
        var jiraTicketName = isJiraPage ? tabInfo.title.substr(1, tabInfo.title.indexOf(']') - 1) : 'NA';
        // chrome.storage.local.set({'activeTicket': jiraTicketName}, function () {});
        if (isJiraPage && eventType === 'updated') {
            chrome.storage.local.get(function (res) {
                var keys = Object.keys(res);
                if (keys.indexOf(jiraTicketName) > -1) {
                    updateIcon('start', tabId);
                    sendBackgroundMessage({action: 'updateStatusImage'});
                }
            });
        }
    });
}

function storeTicketInfo(action) {
    chrome.tabs.query({windowId: windowId, active: true}, function (tabs) {
        var save = {};
        var selectedTab = tabs[0];
        if (selectedTab) {
            var jiraTicketName = selectedTab.title.substr(1, selectedTab.title.indexOf(']') - 1);

            if (action === 'start') {
                save[jiraTicketName] = {start: moment.now(), tabId: selectedTab.id, url: selectedTab.url};
                chrome.storage.local.set(save, function () {});
            } else {
                chrome.storage.local.get(jiraTicketName, function (ticketRes) {
                    var end = moment.now();
                    var start = Object.values(ticketRes)[0].start;
                    sendBackgroundMessage({action: 'logWork', start: start, end: end, ticketName: jiraTicketName});
                });
            }
        }
    });
}

function sendBackgroundMessage(options) {
    options['from'] = 'background';
    chrome.tabs.query({active: true, windowId: windowId}, function (tabs) {
        var selectedTab = tabs[0];
        if (selectedTab) {
            chrome.tabs.sendMessage(selectedTab.id, options, function (response) {});
        }
    });
}

function updateIcon(action, tabId) {
    var iconName = action === 'stop' ? 'inactive_19.png' : 'active_19.png';
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
