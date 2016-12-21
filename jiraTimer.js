$(function () {
    if (window.location.href.indexOf('/secure/CreateWorklog') > -1) {
        chrome.storage.local.get('logWorkFormValues', function (res) {
            var formValues = Object.values(res)[0];
            // clear temporary holder for form values and ticket info
            chrome.storage.local.remove(['logWorkFormValues', formValues.ticketName], function () {});

            // set form values
            $('#comment').val(formValues.comment);
            $('#log-work-time-logged').val(formValues.duration);
            $('#log-work-date-logged-date-picker').val(formValues.startDate)

            // submit
            $('#log-work-submit').click();
        });
    }
});

// content script methods
var cs = {
    toggleIconActive: function(isActive, isOnLoad) {
        var url;
        if (isActive) { // stop, return to inactive
            $('.jiraTimer').removeClass('active');
            $('.jiraTimer').addClass('inactive');
            $('.jiraTimer').text('start();');
        } else { // start, return to active;
            $('.jiraTimer').removeClass('inactive');
            $('.jiraTimer').addClass('active');
            url = chrome.runtime.getURL('code2coffee2.gif');
            $('.jiraTimer').css('background-image', 'url(' + url + ')');
            $('.jiraTimer').text('stop();');
        }

        cs.bounceIn(isOnLoad);
    },
    getDurationInfo: function (start, end, format) {
        var duration = {
            seconds: moment(end).diff(moment(start), 'seconds'),
            minutes: moment(end).diff(moment(start), 'minutes'),
            hours: moment(end).diff(moment(start), 'hours'),
            days: moment(end).diff(moment(start), 'days') // left it running
        };

        duration['seconds'] = duration.seconds - (duration.minutes * 60);

        var hourUnit = format === 'short' ? 'h ' : 'hours ';
        var minuteUnit = format === 'short' ? 'm' : ' minutes ';

        var hourStr = duration.hours > 0 ? duration.hours + hourUnit : '';
        var minuteStr = duration.minutes > 0 && duration.minutes < 60 ? duration.minutes + minuteUnit : '';
        var secondStr = (format !== 'short' && duration.seconds > 0) ? duration.seconds + ' seconds' : '';
        duration['durationString'] = hourStr + minuteStr + secondStr;
        return duration;
    },
    logWork: function(start, end, ticketName) {
        var duration = cs.getDurationInfo(start, end, 'short');
        var commentStr = 'Start: ' + moment(start).format() + '\nEnd: ' + moment(end).format();

        if (duration.days > 0 || duration.hours > 7) {
            cs.sendUpdateTimeToast(start, end, ticketName);
        } else if (duration.minutes < 1) {
            cs.sendClearOnlyToast();
            cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
        } else {
            toastr.clear();
            var save = {
                logWorkFormValues: {
                    duration: duration.durationString,
                    comment: commentStr,
                    startDate: moment(start).format('DD/MMM/YY h:mm A'),
                    ticketName: ticketName
                }
            };
            chrome.storage.local.set(save, function () {});

            // Timing issues prevent modal from opening on $('#log-work').click().
            // To get around this, navigate straight to form page, and then continue running code in document.ready (top of this file).
            var href = $("a.issueaction-log-work").attr('href');
            window.location.href = href;
        }
    },
    sendContentMessage: function(options) {
        options['from'] = 'content';
        chrome.runtime.sendMessage(options, function () {});
    },
    updateTime: function (e) {
        var newStart = $('#jiraStart.toastInput').val();
        var newEnd = $('#jiraEnd.toastInput').val();
        newStart = moment(newStart, "YYYY-MM-DD h:m A").valueOf();
        newEnd = moment(newEnd, "YYYY-MM-DD h:m A").valueOf();
        var ticketName = $('#jiraUpdateTicketName').text();

        cs.toggleIconActive(true, false); // update icon, store logWork
        cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
        cs.logWork(newStart, newEnd, ticketName);
    },
    clearTime: function (e) {
        chrome.storage.local.get(function (res) {
            var keys = Object.keys(res);

            // filter out any local storage keys without hyphen
            keys = $.grep(keys, function (el) {
                return el.indexOf('-') > -1;
            });

            chrome.storage.local.remove(keys, function () {
                cs.toggleIconActive(true, false); // only update icon
                cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
                toastr.clear();
            });
        });
    },
    sendUpdateTimeToast: function(start, end, ticketName){
        // display start / end info for user and don't auto-close toast
        var title = 'Duration is greater than 8 hours';
        var htmlMessage = '<br><p>Did you leave timer running?  Edit Start / End times belows.</p><br>';
        htmlMessage += '<p id="jiraUpdateTicketName">' + ticketName + '</p><br>';
        htmlMessage += '<label><i>Start:</i></label><br><input type="text" class="toastInput" id="jiraStart" value="' + moment(start).format('YYYY-MM-DD h:m A') + '"><br>';
        htmlMessage += '<label><i>End:</i></label><br><input type="text" class="toastInput" id="jiraEnd" value="' + moment(end).format('YYYY-MM-DD h:m A') + '">';
        htmlMessage += '<br><br>';
        htmlMessage += '<button type="button" id="updateTimesBtn" class="btn btn-primary toastBtn">Update</button>';
        htmlMessage += '<button type="button" id="clearTimesBtn" class="btn toastBtn">Clear</button>';
        var $toast = $('.toast:visible').length < 1 && toastr.error(htmlMessage, title, {
                "closeButton": true,
                "timeOut": "0",
                "extendedTimeOut": "0",
                "tapToDismiss": false
            });

        if ($toast.find('#updateTimesBtn').length){
            $toast.delegate('#updateTimesBtn', 'click', cs.updateTime);
        }

        if ($toast.find('#clearTimesBtn').length){
            $toast.delegate('#clearTimesBtn', 'click', cs.clearTime);
        }
    },
    sendClearOnlyToast: function () {
        var title = ('Duration must be at least 1 minute.');
        var htmlMessage = '<br><p>Click below to clear or close.</p>';
        htmlMessage += '<br><br>';
        htmlMessage += '<button type="button" id="clearTimesBtn" class="btn btn-primary toastBtn">Clear</button>';
        var $toast = $('.toast:visible').length < 1 && toastr.error(htmlMessage, title, {
                "closeButton": true,
                "timeOut": "0",
                "extendedTimeOut": "0"
            });

        if ($toast.find('#clearTimesBtn').length){
            $toast.delegate('#clearTimesBtn', 'click', cs.clearTime);
        }
    },
    displayDurationInfo: function(e){
        if ($(e.target).hasClass('active')){
            var jiraTicketName = document.title.substr(1, document.title.indexOf(']') - 1);
            chrome.storage.local.get(jiraTicketName, function (ticketRes) {
                var start = Object.values(ticketRes)[0].start;
                var now = moment.now();
                var duration = cs.getDurationInfo(start, now, 'long');

                // should never run into situations where ticket wasn't started today...
                var htmlMessage = '<br><p>Started today at ' + moment(start).format('h:mm A') + '</p>';
                htmlMessage += '<p>Current time is ' + moment(now).format('h:mm A') + '</p>';
                htmlMessage += '<p>Duration is ' + duration.durationString + '</p>';
                $('.toast:visible').length < 1 && toastr.info(htmlMessage, jiraTicketName, {
                    "positionClass": "toast-bottom-right",
                    "progressBar": true
                });
            });
        }
    },
    bounceIn: function(isOnLoad) {
        if (isOnLoad) {
            anime({
                targets: '.jiraTimer',
                scale: 1.5,
                duration: 300,
                delay: 150,
                easing: 'easeInOutExpo',
                complete: function () {
                    anime({
                        targets: '.jiraTimer',
                        scale: 1,
                        easing: 'easeOutBounce',
                        delay: 150,
                        duration: 300
                    });
                }
            });
        } else {
            anime({
                targets: '.jiraTimer',
                scale: 0,
                delay: 0,
                duration: 150,
                easing: 'easeOutBounce',
                complete: function () {
                    anime({
                        targets: '.jiraTimer',
                        scale: 1.4,
                        duration: 200,
                        delay: 150,
                        easing: 'easeInOutExpo',
                        complete: function () {
                            anime({
                                targets: '.jiraTimer',
                                scale: 1,
                                easing: 'easeOutBounce',
                                delay: 150,
                                duration: 200
                            });
                        }
                    });
                }
            });
        }
    }
}

if ($('.jiraTimer').length === 0) {
    var html = ' \
    <ul class="toolbar-group"> \
        <li class="toolbar-item"> \
            <a class="jiraTimer jira inactive" href="#">start();</a> \
        </li> \
    </ul>';
    $('.toolbar-split.toolbar-split-left').append(html);

    cs.bounceIn(true);
}


$('.jiraTimer').on('click', function (e) {
    var isActive = $(e.target).hasClass('active');
    var action = isActive ? 'stop' : 'start';
    var jiraTicketName = document.title.substr(1, document.title.indexOf(']') - 1);

    chrome.storage.local.get(function (res) {
        var keys = Object.keys(res);

        // filter out any local storage keys without hyphen
        keys = $.grep(keys, function(el) {
            return el.indexOf('-') > -1;
        });

        // determine if changing status is okay first...
        if (keys.length === 0 || (keys.length === 1 && keys[0] === jiraTicketName)){
            cs.toggleIconActive(isActive, false); // send message (update icon, store logWork)
            cs.sendContentMessage({method: 'updateIcon', action: action});
            cs.sendContentMessage({method: 'storeTicketInfo', action: action});
        } else {
            var html = '<div><p><br>Oops! It looks like another JIRA ticket is in progress.  Click the button below to navigate to it.</p><br>';
            chrome.storage.local.get(keys, function(res){
                $.each(res, function(name, tab){
                    html += '<button type="button" class="btn toastBtn navToJira" data-tab-id="' + tab.tabId + '" data-tab-url="' + tab.url + '">' + name + '</button>'
                });
                html += '</div>';
                var $toast = toastr.info(html, 'Another ticket already in progress!', {
                    "closeButton": true,
                    "timeOut": "0",
                    "extendedTimeOut": "0"
                });
                $toast.delegate('.navToJira', 'click', function (e) {
                    toastr.clear($toast);
                    var tabId = parseInt($(e.target).attr('data-tab-id'));
                    var url = $(e.target).attr('data-tab-url');
                    cs.sendContentMessage({method: 'focusOrNavigateToTab', tabId: tabId, url: url});
                });
            });
        }

    });
});

$('.jiraTimer').on('mouseover', cs.displayDurationInfo);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.from === 'background') {
        switch (request.action) {
            case 'logWork':
                cs.logWork(request.start, request.end, request.ticketName);
                break;
            case 'updateStatusImage':
                cs.toggleIconActive(false, true); // don't send message, just update image
                break;
        }
    }
});



