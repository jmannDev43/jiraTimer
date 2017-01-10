$(() => {
    if (window.location.href.indexOf('/secure/CreateWorklog') > -1) {
        chrome.storage.local.get('logWorkFormValues', (res) => {
            const formValues = Object.values(res)[0];
            // clear temporary holder for form values and ticket info
            chrome.storage.local.remove(['logWorkFormValues', formValues.ticketName], () => {});

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
let cs = {
    updateTimerLink: (setClass, isOnLoad, isOnTabFocus) => {
            let url;
            if (setClass === 'active') { // stop, return to inactive
                $('.jiraTimer').removeClass('inactive');
                $('.jiraTimer').addClass('active');
                url = chrome.runtime.getURL('code2coffee2.gif');
                $('.jiraTimer').css('background-image', 'url(' + url + ')');
                $('.jiraTimer').text('stop();');
            } else { // start, return to active;
                $('.jiraTimer').removeClass('active');
                $('.jiraTimer').addClass('inactive');
                $('.jiraTimer').text('start();');
            }

            cs.updateHoverLink(setClass);
            !isOnTabFocus && cs.bounceIn(isOnLoad);
    },
    updateHoverLink: (setClass) => {
        const hasHoverText = $('#key-val').text().indexOf('Hover') > -1;
        const ticketNumber = $('#key-val').text().split(' ')[0];

        if (setClass === 'active'){
            !hasHoverText && $('#key-val').append('<b> (Hover to view duration)</b>');
        } else {
            hasHoverText && $('#key-val').html(ticketNumber);
        }
    },
    getDurationInfo: (start, end, format) => {
        const duration = {
            seconds: moment(end).diff(moment(start), 'seconds'),
            minutes: moment(end).diff(moment(start), 'minutes'),
            hours: moment(end).diff(moment(start), 'hours'),
            days: moment(end).diff(moment(start), 'days') // left it running
        };

        duration['seconds'] = duration.seconds - (duration.minutes * 60);

        const hourUnit = format === 'short' ? 'h ' : 'hours ';
        const minuteUnit = format === 'short' ? 'm' : ' minutes ';

        const hourStr = duration.hours > 0 ? duration.hours + hourUnit : '';
        const minuteStr = duration.minutes > 0 && duration.minutes < 60 ? duration.minutes + minuteUnit : '';
        const secondStr = (format !== 'short' && duration.seconds > 0) ? duration.seconds + ' seconds' : '';
        duration['durationString'] = hourStr + minuteStr + secondStr;
        return duration;
    },
    logWork: (start, end, ticketName) => {
        const duration = cs.getDurationInfo(start, end, 'short');
        const commentStr = `Start: ${moment(start).format()} \nEnd: ${moment(end).format()}`;

        toastr.clear();
        if (duration.days > 0 || duration.hours > 7) {
            cs.sendUpdateTimeToast(start, end, ticketName);
        } else if (duration.minutes < 1) {
            cs.sendClearOnlyToast();
            cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
        } else {
            const save = {
                logWorkFormValues: {
                    duration: duration.durationString,
                    comment: commentStr,
                    startDate: moment(start).format('DD/MMM/YY h:mm A'),
                    ticketName: ticketName
                }
            };
            chrome.storage.local.set(save, () => {});

            // Timing issues prevent modal from opening on $('#log-work').click().
            // To get around this, navigate straight to form page, and then continue running code in document.ready (top of this file).
            const href = $("a.issueaction-log-work").attr('href');
            window.location.href = href;
        }
    },
    sendContentMessage: (options) => {
        options['from'] = 'content';
        chrome.runtime.sendMessage(options, () => {});
    },
    updateTime: (e) => {
        let newStart = $('#jiraStart.toastInput').val();
        let newEnd = $('#jiraEnd.toastInput').val();
        newStart = moment(newStart, "YYYY-MM-DD h:m A").valueOf();
        newEnd = moment(newEnd, "YYYY-MM-DD h:m A").valueOf();
        const ticketName = $('#jiraUpdateTicketName').text();

        cs.updateTimerLink('inactive', false); // update icon, store logWork
        cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
        cs.logWork(newStart, newEnd, ticketName);
    },
    clearTime:(e) => {
        chrome.storage.local.get((res) => {
            let keys = Object.keys(res);

            // filter out any local storage keys without hyphen
            keys = $.grep(keys, (el) => {
                return el.indexOf('-') > -1;
            });

            chrome.storage.local.remove(keys, () => {
                cs.updateTimerLink('inactive', false); // only update icon
                cs.sendContentMessage({method: 'updateIcon', action: 'stop'});
                toastr.clear();
            });
        });
    },
    sendUpdateTimeToast: (start, end, ticketName) => {
        // display start / end info for user and don't auto-close toast
        const title = 'Duration is greater than 8 hours';
        let htmlMessage = '<br><p>Did you leave timer running?  Edit Start / End times belows.</p><br>';
        htmlMessage += '<p id="jiraUpdateTicketName">' + ticketName + '</p><br>';
        htmlMessage += '<label><i>Start:</i></label><br><input type="text" class="toastInput" id="jiraStart" value="' + moment(start).format('YYYY-MM-DD h:m A') + '"><br>';
        htmlMessage += '<label><i>End:</i></label><br><input type="text" class="toastInput" id="jiraEnd" value="' + moment(end).format('YYYY-MM-DD h:m A') + '">';
        htmlMessage += '<br><br>';
        htmlMessage += '<button type="button" id="updateTimesBtn" class="btn btn-primary toastBtn">Update</button>';
        htmlMessage += '<button type="button" id="clearTimesBtn" class="btn toastBtn">Clear</button>';
        const $toast = $('.toast:visible').length < 1 && toastr.error(htmlMessage, title, {
                "closeButton": true,
                "timeOut": "0",
                "extendedTimeOut": "0",
                "tapToDismiss": false
            });

        if ($toast && $toast.find('#updateTimesBtn').length){
            $toast.delegate('#updateTimesBtn', 'click', cs.updateTime);
        }

        if ($toast && $toast.find('#clearTimesBtn').length){
            $toast.delegate('#clearTimesBtn', 'click', cs.clearTime);
        }
    },
    sendClearOnlyToast: () => {
        const title = ('Duration must be at least 1 minute.');
        let htmlMessage = '<br><p>Click below to clear or close.</p>';
        htmlMessage += '<br><br>';
        htmlMessage += '<button type="button" id="clearTimesBtn" class="btn btn-primary toastBtn">Clear</button>';
        const $toast = $('.toast:visible').length < 1 && toastr.error(htmlMessage, title, {
                "closeButton": true,
                "timeOut": "0",
                "extendedTimeOut": "0"
            });

        if ($toast && $toast.find('#clearTimesBtn').length){
            $toast.delegate('#clearTimesBtn', 'click', cs.clearTime);
        }
    },
    displayDurationInfo: (e) => {
        if ($('.jiraTimer').hasClass('active')){
            const jiraTicketName = document.title.substr(1, document.title.indexOf(']') - 1);
            chrome.storage.local.get(jiraTicketName, (ticketRes) => {
                const start = Object.values(ticketRes)[0].start;
                const now = moment.now();
                const duration = cs.getDurationInfo(start, now, 'long');

                // should never run into situations where ticket wasn't started today...
                let htmlMessage = '<br><p>Started today at ' + moment(start).format('h:mm A') + '</p>';
                htmlMessage += '<p>Current time is ' + moment(now).format('h:mm A') + '</p>';
                htmlMessage += '<p>Duration is ' + duration.durationString + '</p>';
                $('.toast:visible').length < 1 && toastr.info(htmlMessage, jiraTicketName, {
                    "positionClass": "toast-bottom-right",
                    "progressBar": true
                });
            });
        }
    },
    bounceIn: (isOnLoad) => {
        if (isOnLoad) {
            anime({
                targets: '.jiraTimer',
                scale: 1.5,
                duration: 300,
                delay: 150,
                easing: 'easeInOutExpo',
                complete: () => {
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
                complete: () => {
                    anime({
                        targets: '.jiraTimer',
                        scale: 1.4,
                        duration: 200,
                        delay: 150,
                        easing: 'easeInOutExpo',
                        complete: () => {
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
    const html = ' \
    <ul class="toolbar-group"> \
        <li class="toolbar-item"> \
            <a class="jiraTimer jira inactive" href="#">start();</a> \
        </li> \
    </ul>';
    $('.toolbar-split.toolbar-split-left').append(html);

    cs.bounceIn(true);
}


$('.jiraTimer').on('click', (e) => {
    e.preventDefault();
    const isActive = $(e.target).hasClass('active');
    const action = isActive ? 'stop' : 'start';
    const jiraTicketName = document.title.substr(1, document.title.indexOf(']') - 1);

    chrome.storage.local.get((res) => {
        let keys = Object.keys(res);

        // filter out any local storage keys without hyphen
        keys = $.grep(keys, (el) => {
            return el.indexOf('-') > -1;
        });

        // determine if changing status is okay first...
        if (keys.length === 0 || (keys.length === 1 && keys[0] === jiraTicketName)){

            if (keys.length === 0){
                cs.updateTimerLink('active', false, false);
            }

            cs.sendContentMessage({method: 'updateIcon', action: action});
            cs.sendContentMessage({method: 'storeTicketInfo', action: action});
        } else {
            let html = '<div><p><br>Oops! It looks like another JIRA ticket is in progress.  Click the button below to navigate to it.</p><br>';
            chrome.storage.local.get(keys, (res) => {
                $.each(res, (name, tab) => {
                    html += '<button type="button" class="btn toastBtn navToJira" data-tab-id="' + tab.tabId + '" data-tab-url="' + tab.url + '">' + name + '</button>'
                });
                html += '</div>';
                const $toast = toastr.info(html, 'Another ticket already in progress!', {
                    "closeButton": true,
                    "timeOut": "0",
                    "extendedTimeOut": "0"
                });
                if ($toast && $toast.find('.navToJira').length){
                    $toast.delegate('.navToJira', 'click', (e) => {
                        toastr.clear($toast);
                        const tabId = parseInt($(e.target).attr('data-tab-id'));
                        const url = $(e.target).attr('data-tab-url');
                        cs.sendContentMessage({method: 'focusOrNavigateToTab', tabId: tabId, url: url});
                    });
                }
            });
        }

    });
});

$('#key-val').on('mouseover', cs.displayDurationInfo);
$('#key-val').on('mouseout', () => {
    if ($('.jiraTimer').hasClass('active')) {
        toastr.clear();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.from === 'background') {
        switch (request.method) {
            case 'logWork':
                cs.logWork(request.start, request.end, request.ticketName);
                break;
            case 'updateStatusImage':
                cs.updateTimerLink(request.setClass, true, true); // don't send message, just update image
                break;
        }
    }
});

