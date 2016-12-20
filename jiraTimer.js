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

if ($('.jiraTimer').length === 0) {
    var html = ' \
    <ul class="toolbar-group"> \
        <li class="toolbar-item"> \
            <a class="jiraTimer jira inactive" href="#">start();</a> \
        </li> \
    </ul>';
    $('.toolbar-split.toolbar-split-left').append(html);
    bounceIn(true);
}

$('.jiraTimer').on('click', function (e) {
    var isActive = $(e.target).hasClass('active');
    // determine if changing status is okay first...
    // console.log(document.title);
    // chrome.storage.local.get('activeTicket', function (res) {
    //     // res.activeTicket;
    //
    // });
    var jiraTicketName = document.title.substr(1, document.title.indexOf(']') - 1);
    chrome.storage.local.get(function (res) {
        var keys = Object.keys(res);

        // filter out any local storage keys without hyphen
        keys = $.grep(keys, function(el) {
            return el.indexOf('-') > -1;
        });

        if (keys.length === 0 || (keys.length === 1 && keys[0] === jiraTicketName)){
            toggleIconActive(isActive, true, false);
        } else {
            // console.log('existing time tracking', keys);
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
                    chrome.runtime.sendMessage({action: 'focusOrNavigateToTab', tabId: tabId, url: url}, function () {});
                });
            });
        }

    });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.from === 'background') {
        switch (request.action) {
            case 'logWork':
                logWork(request.start, request.end, request.ticketName);
                break;
            case 'updateStatusImage':
                toggleIconActive(false, false, true);
                break;
        }
    }
});

function toggleIconActive(isActive, sendMessage, isOnLoad) {
    setTimeout(function () {
        var action = isActive ? 'stop' : 'start';
        if (isActive) { // stop, return to inactive
            $('.jiraTimer').removeClass('active');
            $('.jiraTimer').addClass('inactive');
            $('.jiraTimer').text('start();');
            bounceIn(isOnLoad);
        } else { // start, return to active;
            $('.jiraTimer').removeClass('inactive');
            $('.jiraTimer').addClass('active');
            var url = chrome.runtime.getURL('code2coffee2.gif');
            $('.jiraTimer').css('background-image', 'url(' + url + ')');
            $('.jiraTimer').text('stop();');
            bounceIn(isOnLoad);
        }

        if (sendMessage) {
            chrome.runtime.sendMessage({action: action}, function () {});
        }
    }, 0);
}

function bounceIn(isOnLoad) {
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
            }
        });
    }
}

function logWork(start, end, ticketName) {
    var duration = {
        minutes: moment(end).diff(moment(start), 'minutes'),
        hours: moment(end).diff(moment(start), 'hours'),
        days: moment(end).diff(moment(start), 'days') // left it running
    };

    var hourStr = duration.hours > 0 ? duration.hours + 'h ' : '';
    var minuteStr = duration.minutes > 0 && duration.minutes < 60 ? duration.minutes + 'm' : '';
    var durationStr = hourStr + minuteStr;
    var commentStr = 'Start: ' + moment(start).format() + '\nEnd: ' + moment(end).format();

    duration.days = 1;
    if (duration.days > 0 || duration.hours > 7) {
        // display start / end info for user and don't auto-close toast
        var title = 'Duration is greater than 8 hours';
        toggleIconActive(true, true, false);
        var htmlMessage = '<br>Did you leave timer running?  Edit Start / End times belows. <br><br>';
        htmlMessage += '<label><i>Start:</i></label><br><input type="text" class="toastInput" id="start" value="' + moment(start).format('YYYY-MM-DD h:m A') + '"><br>';
        htmlMessage += '<label><i>End:</i></label><br><input type="text" class="toastInput" id="end" value="' + moment(end).format('YYYY-MM-DD h:m A') + '">';
        htmlMessage += '<br><br>';
        htmlMessage += '<button type="button" id="updateTimesBtn" class="btn toastBtn">Update</button>';
        htmlMessage += '<button type="button" id="clearTimesBtn" class="btn toastBtn">Clear</button>';
        var $toast = $('.toast:visible').length < 1 && toastr.error(htmlMessage, title, {
            "closeButton": true,
            "timeOut": "0",
            "extendedTimeOut": "0"
        });

        $toast.delegate('#updateTimesBtn', 'click', function (e) {
            console.log('updateTime', e);
        });

        $toast.delegate('#clearTimesBtn', 'click', function (e) {
            console.log('clearTime', e);
            chrome.storage.local.get(function (res) {
                var keys = Object.keys(res);

                // filter out any local storage keys without hyphen
                keys = $.grep(keys, function (el) {
                    return el.indexOf('-') > -1;
                });

                chrome.storage.local.remove(keys, function () {
                    console.log('removed');
                });
            });
        });

    } else if (duration.minutes < 1) {
        $('.toast:visible').length < 1 && toastr.error('Duration must be at least 1 minute.');
        toggleIconActive(true, false, false);
    } else {
        var save = {
            logWorkFormValues: {
                duration: durationStr,
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
}
