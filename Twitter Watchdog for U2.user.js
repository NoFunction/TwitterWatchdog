// ==UserScript==
// @name         Twitter Watchdog for U2
// @namespace    http://u2.is/twd/
// @version      1.0
// @description  This script is an addon for Twitter. When searching for Periscope streams of a U2 show it will show you a list of all available streams, it will also show you a list of available Mixlr streams and allow you to play one in an embeded player. And it will monitor the U2 Meerkat stream and alert you when it goes live.
// @author       U2fanIceland
// @match        https://twitter.com/search*
// @match        https://www.periscope.tv/*
// @match        http://meerkatapp.co/*
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js
// ==/UserScript==

var scopelinks = [], mixlrlinks = [], last_tweet_id = false;

var timers = {
 start: 0,
 scopers: 0,
 mixlrs: 0,
 time: 0,
 scope: 0,
 mrkat: 0,
 mrkat_link: 0,
 wait: 0,
};

var twd_text_nolinks = 'No recent links found';
var twd_meerkat_timelimit = (5 * 6e4);

var twd_config = [
 {
  title: 'Twitter',
  config: [
   {
    title: 'Periscope limit',
    info: 'Timelimit for Periscope links',
    name: 'twd-scopelink-timelimit',
    type: 'select',
    values: [
     {val: 0, text: 'No limit'},
     {val: (5 * 6e4), text: '5 minutes'},
     {val: (30 * 6e4), text: '30 minutes'},
     {val: (60 * 6e4), text: '1 hour'},
     {val: (120 * 6e4), text: '2 hours'},
    ],
   },
   {
    title: 'Mixlr limit',
    info: 'Timelimit for Mixlr links',
    name: 'twd-mixlrlink-timelimit',
    type: 'select',
    values: [
     {val: 0, text: 'No limit'},
     {val: (5 * 6e4), text: '5 minutes'},
     {val: (30 * 6e4), text: '30 minutes'},
     {val: (60 * 6e4), text: '1 hour'},
     {val: (120 * 6e4), text: '2 hours'},
    ],
   },
   {
    title: 'Mixlr refresh',
    info: 'Auto refresh for Mixlr links',
    type: 'checkbox',
    values: [
     {val: 'twd-mixlr-autorefresh', text: 'Autorefresh list every 60 seconds'},
    ],
   },
  ],
 },
 {
  title: 'Periscope',
  config: [
   {
    title: 'Autoclose',
    type: 'checkbox',
    values: [
     {val: 'twd-scope-autoclose', text: 'Autoclose offline streams'},
    ],
   },
   {
    title: 'Cleanup',
    name: 'twd-scope-cleanup',
    type: 'select',
    values: [
     {val: 0, text: 'No cleanup'},
     {val: 1, text: 'Hide hearts'},
     {val: 2, text: 'Hide comments'},
     {val: 3, text: 'Hide hearts & comments'},
    ],
   },
  ],
 },
 {
  title: 'Meerkat',
  config: [
   {
    title: 'Autoclose',
    type: 'checkbox',
    values: [
     {val: 'twd-meerkat-autoclose', text: 'Autoclose offline streams'},
    ]
   },
  ],
 },
];

var twd_config_def = {
 'twd-scopelink-timelimit': (60 * 6e4),
 'twd-mixlrlink-timelimit': (120 * 6e4),
 'twd-mixlr-autorefresh': 0,
 'twd-scope-autoclose': 0,
 'twd-scope-cleanup': 0,
 'twd-meerkat-autoclose': 0,
}

window.addEventListener('load', DocOnload, false);

function DocOnload() {
 switch (document.location.host) {
  case 'twitter.com':
   if (!(/u2/i.test(document.title) && /periscope/i.test(document.title))) break;

   $('.WhoToFollow').remove();
   $('.SidebarCommonModules').prepend('<div id="scopelist" class="linklist"></div><div id="mixlrlist" class="linklist"></div><div id="mkatlist" class="linklist"></div>');
   $('#scopelist').append('<div class="flex-module-header"><h3>Periscope Links</h3>&nbsp;<span class="middot">·</span>&nbsp;<a href="#" id="twd-settings-trigger">Settings</a></div><div id="scopelist-body"></div>');
   $('#mixlrlist').append('<div class="flex-module-header"><h3>Mixlr Links</h3><span id="mixlr-refresh">&nbsp;<span class="middot">·</span>&nbsp;<a href="#">Refresh</a></span><span id="mixlr-offbtn">&nbsp;<span class="middot">·</span>&nbsp;<a href="#">Close player</a></span></div><div id="mixlrlist-body"></div>');

   $('#mixlr-offbtn a').click(function () {
    $('#mixlr-player').remove();
    $(this).parent().hide();
    return false;
   });

   $('#mixlr-refresh a').click(function () {
    $(this).parent().hide();
    $('#mixlrlist-body').html('<span class="twd-loading"></span>&nbsp;Loading, please wait...');
    timers.mixlrs = setTimeout(GetMixlrs, 2000);
    return false;
   });

   $('#scopelist-body,#mixlrlist-body').html('<span class="twd-loading"></span>&nbsp;Loading, please wait...');

   var elem_dialog = $('<div id="twd_dialog" class="modal-container" />');
   elem_dialog.append('<div id="twd_dialog-close-target"></div>');
   var elem_modal = $('<div class="modal" id="twd_dialog-dialog" role="dialog" />');
   var elem_modal_content = $('<div class="modal-content" role="document" />');
   elem_modal_content.append('<div class="modal-header unselectable" id="twd_dialog-head"><h3 class="modal-title" id="twd_dialog-header">Twitter Watchdog for U2 - Settings</h3></div>');
   elem_modal_content.append('<div class="modal-body"><form id="twd-settings-form" class="t1-form form-horizontal" autocomplete="off"></form></div>');
   elem_modal_content.append('<div class="modal-footer"><button type="button" class="btn primary-btn done" id="twd-settings-save">Done</button></div>');
   elem_modal.append(elem_modal_content);
   elem_modal.append('<button type="button" class="modal-btn modal-close js-close" id="twd_dialog-close-trigger"><span class="Icon Icon--close Icon--medium"><span class="visuallyhidden">Close</span></span></button>');
   elem_dialog.append(elem_modal);
   $('#page-container').append(elem_dialog);

   $('#twd-settings-save').click(function () {
    SaveSettings();
    $('#twd_dialog').fadeOut();
    $('body').removeClass('modal-enabled');
    document.location.reload();
    return false;
   });

   $('#twd-settings-trigger').click(function () {
    $('body').addClass('modal-enabled');
    $('#twd_dialog-dialog').hide();
    $('#twd_dialog').show(function () {
     SetupSettings();
     var elem_dialog = $('#twd_dialog-dialog');
     var css_top = Math.floor((window.innerHeight - elem_dialog.innerHeight()) / 2);
     var css_left = Math.floor((window.innerWidth - elem_dialog.innerWidth()) / 2);
     elem_dialog.css('top', css_top + 'px').css('left', css_left + 'px');
     elem_dialog.show();
    });
    return false;
   });

   $('#twd_dialog-close-trigger,#twd_dialog-close-target').click(function (e) {
    $('#twd_dialog').fadeOut();
    $('body').removeClass('modal-enabled');
    return false;
   });

   var css = '';
   css += '#mixlr-offbtn, #mixlr-refresh {display: none;}';
   css += '.linklist {padding: 15px;}';
   css += '.twd-loading {display: inline-block; vertical-align: middle; width: 16px; height: 16px; background-repeat: no-repeat; background-image: url(data:image/gif;base64,R0lGODlhEAAQAPQAAP///2BgYPr6+oKCgrKysmNjY3d3d+Xl5cjIyG1tbampqZ+fn+3t7b6+vtvb24yMjJWVlQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAAFUCAgjmRpnqUwFGwhKoRgqq2YFMaRGjWA8AbZiIBbjQQ8AmmFUJEQhQGJhaKOrCksgEla+KIkYvC6SJKQOISoNSYdeIk1ayA8ExTyeR3F749CACH5BAkKAAAALAAAAAAQABAAAAVoICCKR9KMaCoaxeCoqEAkRX3AwMHWxQIIjJSAZWgUEgzBwCBAEQpMwIDwY1FHgwJCtOW2UDWYIDyqNVVkUbYr6CK+o2eUMKgWrqKhj0FrEM8jQQALPFA3MAc8CQSAMA5ZBjgqDQmHIyEAIfkECQoAAAAsAAAAABAAEAAABWAgII4j85Ao2hRIKgrEUBQJLaSHMe8zgQo6Q8sxS7RIhILhBkgumCTZsXkACBC+0cwF2GoLLoFXREDcDlkAojBICRaFLDCOQtQKjmsQSubtDFU/NXcDBHwkaw1cKQ8MiyEAIfkECQoAAAAsAAAAABAAEAAABVIgII5kaZ6AIJQCMRTFQKiDQx4GrBfGa4uCnAEhQuRgPwCBtwK+kCNFgjh6QlFYgGO7baJ2CxIioSDpwqNggWCGDVVGphly3BkOpXDrKfNm/4AhACH5BAkKAAAALAAAAAAQABAAAAVgICCOZGmeqEAMRTEQwskYbV0Yx7kYSIzQhtgoBxCKBDQCIOcoLBimRiFhSABYU5gIgW01pLUBYkRItAYAqrlhYiwKjiWAcDMWY8QjsCf4DewiBzQ2N1AmKlgvgCiMjSQhACH5BAkKAAAALAAAAAAQABAAAAVfICCOZGmeqEgUxUAIpkA0AMKyxkEiSZEIsJqhYAg+boUFSTAkiBiNHks3sg1ILAfBiS10gyqCg0UaFBCkwy3RYKiIYMAC+RAxiQgYsJdAjw5DN2gILzEEZgVcKYuMJiEAOwAAAAAAAAAAAA==);}';
   css += '#scopelist-body table td {padding: 2px;}';

   css += '.scopelink {display: inline-block; height: 20px; line-height: 20px; font-size: 11px; font-family: "Helvetica Neue",Helvetica,Arial,sans-serif; font-weight: 700; text-decoration: none; color: #fff; background-color: #40a4c4; border-radius: 2px; white-space: nowrap; overflow: hidden; -webkit-transition: background 250ms ease-out,color 250ms ease-out; -moz-transition: background 250ms ease-out,color 250ms ease-out; transition: background 250ms ease-out,color 250ms ease-out;}';
   css += '.scopelink:hover, .scopelink:visited, .scopelink:focus {text-decoration: none; color: #fff;}';
   css += '.scopelink-live {background-color: #E16956;}';
   css += '.scopelink-logo {display: inline-block; vertical-align: middle; width: 13px; height: inherit; padding: 0 2px; background-position: center 3px; background-repeat: no-repeat; background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAASCAYAAACEnoQPAAAAAXNSR0IArs4c6QAAAh9JREFUOBGFU01oE0EUnolpkm0PoQqxmEtREKEWejAHexREIRByEbwJ3iRnCZ6EiBdP3uJB2tLSCL0HISkGxZ9DPShEYy+BjYE1SBI3lmST/Rm/N82Eptvig2/ezHvf997M7A5nfuMIzQBBIAAIwANswAFONSLPNhqNu5ZlvXFd1wD0fr//qlQqrSAXBqi4z3gymZwHcVOcYJ7n/W02m/egiviUCGidTufpUZ354a3QnzwS5sd3MowCw0qlcg1cOtLEAoVCYYmSwvOE0zMl2fnTFd/u3Jbo7r6WscFgsAvVHMDpjGTBRCJxnXMeOvjymRkvnrPB/nfWKqwfZjH+3tmS83A4vBqPx+XWVftANBq9Slm7ZbDe3icJyR4PdrfDhGUxHolo+Xz+YiqV6lJnuj3hOE6PeJHFS+R8Flq4QEIZr9VqB5gI9R3darX6njLalSU2f+OWJKmBB2fYwv0HcjkajX5ks9lfKkeeup8bDod76raxdWGs5UVre11YP3UVFvV6/SG4s2MN3KFYKxaLN3Hj7oR5bILiX2Ox2Hnw1XEnYgqcbbfbL49p1NIrl8tJcKa6SjUG+U+n0+lF6qAUyhuG8YyKA1NdlZg8FdByudyybdv7Smia5ibiMeDMmAPnNxJT5blMJnMZR9jQdf0x1iSkl0b5iU0txlGKEUIAnY+eI31XFyCjJyrtJDElVJx2QWQlUJ448gxy8p9hSqS4/wALElUKWRnKqAAAAABJRU5ErkJggg==); background-size: 13px 15px;}';
   css += '.scopelink-name {display: inline-block; padding: 0 6px 0 0; max-width: 105px;}';
   css += '.scopelink-status {display: none; font-size: 9px; width: 3.5em; text-align: center; background-color: #D55548; -moz-transition: opacity 250ms ease-out; transition: opacity 250ms ease-out; -webkit-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; -moz-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards;}';
   css += '.scopelink-live .scopelink-status {display: inline-block;}';
   css += '.scopelink-total, .scopelink-timestamp {width: 40px;}';
   css += '.scopelink-new {font-size: 9px; width: 4em;}';
   css += '.scopelink-new span {display: inline-block; width: 3.5em; text-align: center; font-weight: 700; color: #fff; background-color: #00C800; border-radius: 2px;}';

   css += '#mixlrlist-body table td {padding: 2px;}';
   css += '.mixlrlink {display: inline-block; height: 20px; line-height: 20px; font-size: 11px; font-family: "Helvetica Neue",Helvetica,Arial,sans-serif; font-weight: 700; text-decoration: none; color: #fff; background-color: #40a4c4; border-radius: 2px; white-space: nowrap; overflow: hidden; -webkit-transition: background 250ms ease-out,color 250ms ease-out; -moz-transition: background 250ms ease-out,color 250ms ease-out; transition: background 250ms ease-out,color 250ms ease-out; cursor: pointer;}';
   css += '.mixlrlink-live {background-color: #E16956;}';
   css += '.mixlrlink-logo {display: inline-block; vertical-align: middle; width: 16px; height: inherit; padding: 0 2px; background-position: center 1px; background-repeat: no-repeat; background-image: url(data:image/png;base64,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); background-size: 16px 16px;}';
   css += '.mixlrlink-name {display: inline-block; padding: 0 6px 0 0; max-width: 105px;}';
   css += '.mixlrlink-status {display: none; font-size: 9px; width: 3.5em; text-align: center; background-color: #D55548; -moz-transition: opacity 250ms ease-out; transition: opacity 250ms ease-out; -webkit-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; -moz-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards;}';
   css += '.mixlrlink-live .mixlrlink-status {display: inline-block;}';
   css += '.mixlrlink-total, .mixlrlink-timestamp {width: 40px;}';
   css += '.mixlrlink-new {font-size: 9px; width: 4em;}';
   css += '.mixlrlink-new span {display: inline-block; width: 3.5em; text-align: center; font-weight: 700; color: #fff; background-color: #00C800; border-radius: 2px;}';

   css += '.mrkatlink {display: inline-block; height: 20px; line-height: 20px; font-size: 11px; font-family: "Helvetica Neue",Helvetica,Arial,sans-serif; font-weight: 700; text-decoration: none; color: #fff; background-color: #40a4c4; border-radius: 2px; white-space: nowrap; overflow: hidden; -webkit-transition: background 250ms ease-out,color 250ms ease-out; -moz-transition: background 250ms ease-out,color 250ms ease-out; transition: background 250ms ease-out,color 250ms ease-out;}';
   css += '.mrkatlink:hover, .mrkatlink:visited, .mrkatlink:focus {text-decoration: none; color: #fff;}';
   css += '.mrkatlink-live {background-color: #E16956;}';
   css += '.mrkatlink-logo {display: inline-block; vertical-align: middle; width: 16px; height: 16px; padding: 0 2px; background-position: center 0px; background-repeat: no-repeat; background-image: url(data:image/png;base64,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); background-size: 16px 16px;}';
   css += '.mrkatlink-name {display: inline-block; padding: 0 6px 0 0;}';
   css += '.mrkatlink-status {display: none; font-size: 9px; width: 3.5em; text-align: center; background-color: #D55548; -moz-transition: opacity 250ms ease-out; transition: opacity 250ms ease-out; -webkit-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; -moz-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards;}';
   css += '.mrkatlink-live .mrkatlink-status {display: inline-block;}';

   css += '@keyframes periscope-status-pulse{0% {color: rgba(255,255,255,.3); text-shadow: none;} 60% {color: #fff; background-color: #D75443; text-shadow: 0 0 2px rgba(0,0,0,.4);} 70% {color: #fff; background-color: #D75443; text-shadow: 0 0 2px rgba(0,0,0,.4);} 100% {color: rgba(255,255,255,.3); text-shadow:none;}}';

   css += '#twd_dialog-close-target {position: absolute; top: 0; right: 0; bottom: 0; left: 0;}';
   css += '#twd_dialog-dialog {position: relative; border-radius: 6px; box-shadow: 0 4px 15px rgba(32,47,51,.20); z-index: 6000;}';
   css += '#twd_dialog-head {cursor: default;}';
   css += '#twd_dialog-dialog hr {margin: 20px -12px; border: 0; border-top: 1px solid #eee; height: 0; padding: 0;}';
   $('body').append($('<style/>').text(css));

   $('.AdaptiveFiltersBar-item .js-nav').removeClass('js-nav');
   $('.js-new-items-bar-container').click(GetScopers);
   timers.start = setTimeout(function () {
    GetScopers();
    GetMixlrs();
    ShowMeerkat();
    CheckMeerkat();
   }, 2000);
   break;

  case 'www.periscope.tv':
   if ($('.ProfileBroadcasts-noBroadcasts').length) {
    CloseScope();
    return;
   }
   if (document.location.hash == '#live') {
    $('.ProfileSidebar-bottomClose').click();
   }
   $('title').text('* LIVE * - ' + $('.ProfileUsername').text());

   css = '';
   css += '.mrkatlink {display: inline-block; height: 20px; line-height: 20px; font-size: 11px; font-family: "Helvetica Neue",Helvetica,Arial,sans-serif; font-weight: 700; text-decoration: none; color: #fff; background-color: #40a4c4; border-radius: 2px; white-space: nowrap; overflow: hidden; -webkit-transition: background 250ms ease-out,color 250ms ease-out; -moz-transition: background 250ms ease-out,color 250ms ease-out; transition: background 250ms ease-out,color 250ms ease-out; z-index: 2; box-sizing: content-box;}';
   css += '.mrkatlink:hover, .mrkatlink:visited, .mrkatlink:focus {text-decoration: none; color: #fff;}';
   css += '.mrkatlink-live {background-color: #E16956;}';
   css += '.mrkatlink-logo {display: inline-block; vertical-align: middle; width: 16px; height: 16px; padding: 0 2px; background-position: center 0px; background-repeat: no-repeat; background-image: url(data:image/png;base64,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); background-size: 16px 16px; box-sizing: inherit;}';
   css += '.mrkatlink-name {display: inline-block; padding: 0 6px 0 0;}';
   css += '.mrkatlink-status {display: none; font-size: 9px; width: 3.5em; text-align: center; background-color: #D55548; -moz-transition: opacity 250ms ease-out; transition: opacity 250ms ease-out; -webkit-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; -moz-animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards; animation: periscope-status-pulse 2s 250ms ease-in-out infinite backwards;}';
   css += '.mrkatlink-live .mrkatlink-status {display: inline-block;}';
   css += '.mrkatlink-scope {position: fixed; bottom: 0px; left: 50%; transform: translate(-50%, -50%);}';
   css += '.mrkaticon-heart {display: inline-block; width: 16px; height: 16px; background-position: center; background-repeat: no-repeat; background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAMCAYAAABSgIzaAAAAAXNSR0IArs4c6QAAAUBJREFUKBWFkj9Lw1AUxe+9r6SD4KbgInTRQHFwMJuCUjoItkPtWP0MgosgiDjU1U/g4hYDNYJrgoODxcFBqCIiODgo+AdRqkmu7w4N1ifmDMm953fOCwlB0CpVapNfnGwjgsMAd8jgj40MbQq7un/YYIQKAo5qdkqk1oKWe4alan0iSqK2NvMSTIV4DKArDNOpJwPiJyl2chHHTaMkAeYZuRlitpIImsQMjgEzDASYIn15z8gZmAGJEPnEIBmGflhASllb8sIZ2RTrUhcsXFc3nYvHgm0/6a83n9J/BkRaCVvekZLM7WWnXbCLz4BQ1qs+9E8xIa2GvrcjtC80V60txEmyp/3BX9VXArUUHO4f9Py+opizlfo4Q+wxc1F2/cecA6rF0HevZe/JKAooNxoD3Ze3XZmH87ll13U/ZP6pb4J2Yfp4iyJrAAAAAElFTkSuQmCC);}';
   css += '.mrkaticon-comments {display: inline-block; width: 16px; height: 16px; background-position: center; background-repeat: no-repeat; background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAolBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///+grwMoAAAANHRSTlMAAkNgXywFtf53eEuKi3K9jM/DzrPr6fjxbuWnrq2qT21oEvlHbD1Twvy7mpyYBgimEyUZ8Vzp/wAAAAFiS0dENd622WsAAAAJcEhZcwAAEbcAABG3AZpjUysAAABpSURBVBjTY2AgBjAyMbPAACtIgI3dBAY4ONEFuBi4eXj5+JEFBExMBIVIFhAWERUDAVFxEwlJkICUtIysrKyMnLyCqKISSAAKlFUYVNUYGNQ1NLW0dUBAl5VBTx/oLGYDQ1SfGBnj9ykA0iEW2vV63ygAAAAldEVYdGRhdGU6Y3JlYXRlADIwMTQtMDctMDRUMTQ6NTc6MTkrMDg6MDDqbFp6AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE0LTA3LTA0VDE0OjU3OjE5KzA4OjAwmzHixgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAAASUVORK5CYII=);}';
   css += '@keyframes periscope-status-pulse{0% {color: rgba(255,255,255,.3); text-shadow: none;} 60% {color: #fff; background-color: #D75443; text-shadow: 0 0 2px rgba(0,0,0,.4);} 70% {color: #fff; background-color: #D75443; text-shadow: 0 0 2px rgba(0,0,0,.4);} 100% {color: rgba(255,255,255,.3); text-shadow:none;}}';

   var elem_style = $('<style />');
   elem_style.text(css);
   $('body').append(elem_style);

   SetupScope();
   WatchScope();
   break;

  case 'meerkatapp.co':
   SetupKat();
   WatchKat();
   break;
 }
}

function SetupSettings() {
 var elem_form = $('#twd-settings-form');
 elem_form.empty();
 for (i = 0; i < twd_config.length; i++) {
  var data = twd_config[i];
  if (i) {
   elem_form.append('<hr />');
  }
  elem_form.append('<h3 class="settings-header">' + data.title + '</h3>');
  var config = data.config;
  for (x = 0; x < config.length; x++) {
   var item = config[x];
   var elem_field = false;
   switch (item.type) {
    case 'select':
     elem_field = $('<div class="control-group" />');
     elem_field.append('<label for="' + item.name + '" class="t1-label control-label">' + item.title + '</label>');
     var elem_controls = $('<div class="controls" />');
     var elem_select = $('<select class="t1-select" id="' + item.name + '" />');
     var val = GM_getValue(item.name, twd_config_def[item.name]);
     for (k = 0; k < item.values.length; k++) {
      var elem_option = $('<option />').val(item.values[k].val).text(item.values[k].text);
      if (item.values[k].val == val) {
       elem_option.attr('selected', true);
      }
      elem_select.append(elem_option);
     }
     elem_controls.append(elem_select);
     if (item.info) {
      elem_controls.append('<p class="notification">' + item.info + '</p>');
     }
     elem_field.append(elem_controls);
     break;

    case 'checkbox':
     elem_field = $('<fieldset class="control-group" />');;
     elem_field.append($('<legend class="t1-legend control-label" />').text(item.title));
     var elem_controls = $('<div class="controls" />');
     for (k = 0; k < item.values.length; k++) {
      var elem_label = $('<label class="t1-label checkbox" />');
      var elem_check = $('<input type="checkbox" />');
      elem_check.attr('id', item.values[k].val);
      elem_check.attr('checked', (GM_getValue(item.values[k].val, twd_config_def[item.values[k].val]) == 1));
      elem_label.append(elem_check);
      elem_label.append(item.values[k].text);
      elem_controls.append(elem_label);
      if (item.info) {
       elem_controls.append('<p class="notification">' + item.info + '</p>');
      }
     }
     elem_field.append(elem_controls);
     break;
   }
   if (elem_field) {
    elem_form.append(elem_field);
   }
  }
 }
}

function SaveSettings() {
 $('#twd-settings-form').find('input,select').each(function () {
  var id = $(this).attr('id');
  if (!id) return true;
  var val;
  if ($(this).is(':checkbox')) {
   val = ($(this).is(':checked') ? 1 : 0);
  }
  else {
   val = $(this).val();
  }
  GM_setValue(id, val);
 });
 GM_setValue('twd-settings-saved', 1);
}

function GetSetting(name) {
 return GM_getValue(name, twd_config_def[name]);
}

function GetScopers() {
 var elem_list = $('.stream-item .original-tweet');
 var card_list = [];
 var show_new = (scopelinks.length != 0);

 clearTimeout(timers.scopers);
 clearTimeout(timers.time);

 elem_list.each(function (i, e) {
  if (last_tweet_id && $(this).attr('data-tweet-id') == last_tweet_id) return false;
  var card = $($(this).attr('data-expanded-footer'));
  var card_src = card.find('.js-macaw-cards-iframe-container').attr('data-src');
  if (!card_src) {
   card_src = $(this).find('.js-macaw-cards-iframe-container').attr('data-src');
   if (!card_src) return true;
  }

  var timestamp = $(this).find('._timestamp').attr('data-time-ms');
  var link_timelimit = Number(GetSetting('twd-scopelink-timelimit'));
  if (link_timelimit) {
   var time_now = (new Date()).getTime();
   var time_link = timestamp;
   if (time_now - time_link > link_timelimit) {
    return true;
   }
  }

  card_list.push({src: card_src, timestamp: timestamp});
 });
 card_list.reverse();
 last_tweet_id = elem_list.first().attr('data-tweet-id');

 if (!card_list.length) {
  if (!$('#scopelist-body table').length) {
   $('#scopelist-body').text(twd_text_nolinks);
  }
  return;
 }

 $.each(scopelinks, function (i, scoper) {
  scoper.new = false;
 });

 $.each(card_list, function (i, card) {
  $('<div />').load('https://twitter.com' + card.src, function (html, status, xhr) {
   var elem_html = $(html).find('.SummaryCard-content p');
   if (status != 'error') {
    var matches = /@([^) ]+)/.exec(elem_html.text());
    if (!matches) {
     return;
    }
    var name = matches[1];
    var scoper = FindUser(scopelinks, name);
    if (!scoper) {
     scoper = {
      name: name,
      total: 0,
      new: show_new
     };
     scopelinks.push(scoper);
    }
    else {
     scoper.new = false;
    }
    if ((show_new && !scoper.total) || (scoper.timestamp && (card.timestamp - scoper.timestamp) >= 120000)) {
     var scopers_offline = GM_getValue('scopers_offline', '');
     var offline_list = scopers_offline.split(',').filter(Boolean);
     var name_index = offline_list.indexOf(scoper.name);
     if (name_index != -1) {
      offline_list.splice(name_index, 1);
      scopers_offline = offline_list.join(',');
      GM_setValue('scopers_offline', scopers_offline);
     }
    }
    scoper.timestamp = card.timestamp;
    scoper.total++;
   }
   if (i == card_list.length - 1) ShowScopers();
  });
 });
}

function ShowScopers() {
 $('#scopelist-body').empty();
 var table = $('<table width="100%" />');
 scopelinks.sort(SortList);
 var listlength = scopelinks.length;
 for (var i = 0; i < listlength; i++) {
  var scoper = scopelinks[i];

  var table_row = $('<tr />');
  var table_td = $('<td />');
  var elem_link = $('<a />');

  elem_link.attr('href', 'https://www.periscope.tv/' + scoper.name + '#live');
  elem_link.attr('target', '_blank');
  elem_link.addClass('scopelink');
  elem_link.attr('data-name', scoper.name);
  elem_link.append($('<span class="scopelink-logo" />'));
  elem_link.append($('<span class="scopelink-name" />').text('@' + scoper.name));
  elem_link.append($('<span class="scopelink-status" />').text('LIVE'));

  table_td.append(elem_link);
  table_row.append(table_td);

  var table_td = $('<td align="right" />');
  table_td.addClass('scopelink-total');
  table_td.append(scoper.total);
  table_row.append(table_td);

  var table_td = $('<td align="right" />');
  table_td.text(GetTime(scoper.timestamp));
  table_td.attr('data-timestamp', scoper.timestamp);
  table_td.addClass('scopelink-timestamp');
  table_row.append(table_td);

  var table_td = $('<td align="center" />');
  table_td.addClass('scopelink-new');
  if (scoper.new) {
   table_td.append($('<span />').text('NEW!'));
  }
  else {
   table_td.html('&nbsp;');
  }
  table_row.append(table_td);

  table.append(table_row);
 }
 $('#scopelist-body').append(table);

 var scopers_offline = GM_getValue('scopers_offline', '');
 var offline_list = scopers_offline.split(',').filter(Boolean);
 $.each(offline_list, function (i, name) {
  var scoper = FindUser(scopelinks, name);
  if (!scoper) {
   offline_list.splice(i, 1);
  }
 });
 scopers_offline = offline_list.join(',');
 GM_setValue('scopers_offline', scopers_offline);

 WatchScopers();
 WatchTime();
}

function WatchScopers() {
 var link_timelimit = Number(GetSetting('twd-scopelink-timelimit'));
 var scopers_offline = GM_getValue('scopers_offline', '');
 var offline_list = scopers_offline.split(',').filter(Boolean);

 $('.scopelink').each(function () {
  var elem_parent = $(this).parents('tr');
  if (link_timelimit) {
   var time_now = new Date().getTime();
   var time_link = elem_parent.find('.scopelink-timestamp').attr('data-timestamp');
   if (time_now - time_link > link_timelimit) {
    elem_parent.remove();
    return true;
   }
  }
  var name = $(this).attr('data-name');
  if (offline_list.indexOf(name) != -1) {
   $(this).removeClass('scopelink-live');
  }
  else {
   $(this).addClass('scopelink-live');
  }
 });
 if (!$('.scopelink').length && $('#scopelist-body table').length) {
  $('#scopelist-body').text(twd_text_nolinks);
 }
 if (!$('.mixlrlink').length && $('#mixlrlist-body table').length) {
  $('#mixlrlist-body').text(twd_text_nolinks);
 }
 var meerkat_time = GM_getValue('twd-meerkat-time');
 if (meerkat_time) {
  var elem_link = $('#twd-meerkat-link');
  if (elem_link.attr('data-timestamp') != meerkat_time) {
   elem_link.attr('data-timestamp', meerkat_time).addClass('mrkatlink-live');
   clearTimeout(timers.mrkat_link);
   timers.mrkat_link = setTimeout(function () {
    $('#twd-meerkat-link').removeClass('mrkatlink-live');
    GM_setValue('twd-meerkat-time', false);
   }, twd_meerkat_timelimit);
  }
 }

 timers.scopers = setTimeout(WatchScopers, 1000);
}

function WatchTime() {
 var scopelink_timelimit = Number(GetSetting('twd-scopelink-timelimit'));
 var mixlrlink_timelimit = Number(GetSetting('twd-mixlrlink-timelimit'));
 var scopers_offline = GM_getValue('scopers_offline', '');
 var offline_list = scopers_offline.split(',').filter(Boolean);
 var time_now = new Date().getTime();

 $('.scopelink-timestamp, .mixlrlink-timestamp').each(function () {
  var scoper = $(this).hasClass('scopelink-timestamp');
  var link_timestamp = $(this).attr('data-timestamp');
  var link_timelimit = (scoper ? scopelink_timelimit : mixlrlink_timelimit);

  if (link_timelimit) {
   if (time_now - link_timestamp > link_timelimit) {
    var name = $(this).parents('tr').find('.scopelink').attr('data-name');
    if (scoper) {
     var name_index = offline_list.indexOf(name);
     if (name_index != -1) {
      offline_list.splice(name_index, 1);
      scopers_offline = offline_list.join(',');
      GM_setValue('scopers_offline', scopers_offline);
     }
    }
    $(this).parents('tr').remove();
    return true;
   }
  }
  var link_time = GetTime(link_timestamp);
  if ($(this).text() != link_time) {
   $(this).text(link_time);
  }
 });

 timers.time = setTimeout(WatchTime, 60000);
}

function GetTime(time) {
 var diff = (new Date().getTime() - time);
 var h = Math.floor(diff / 36e5);
 var m = Math.floor(diff % 36e5 / 60000);
 var s = Math.floor(diff % 60000 / 1000);
 return (h ? h + 'h' : (m ? m + 'm' : s + 's'));
}

function GetMixlrs() {
 var elem_tweets = $('<div />');
 var card_list = [];
 var show_new = (scopelinks.length != 0);
 var regex = new RegExp('^https?://(mixlr.com/([^/]+))/?$', 'i');
 mixlrlinks = [];

 elem_tweets.load('https://twitter.com/search?q=u2%20mixlr%20filter%3Alinks&src=typd .search-stream', function () {
  var elem_list = $(this).find('.stream-item .original-tweet');

  elem_list.each(function () {
   var elem_link = $(this).find('a[data-expanded-url]');
   if (!elem_link.length) return true;
   var url = elem_link.attr('data-expanded-url');
   if (!url) return true;
   var matches = url.match(regex);
   if (!matches) return true;

   var card = $($(this).attr('data-expanded-footer'));
   var card_src = card.find('.js-macaw-cards-iframe-container').attr('data-src') || $(this).find('.js-macaw-cards-iframe-container').attr('data-src');
   if (!card_src) {
    return true;
   }

   var timestamp = $(this).find('._timestamp').attr('data-time-ms');
   var link_timelimit = Number(GetSetting('twd-mixlrlink-timelimit'));
   if (link_timelimit) {
    var time_now = (new Date()).getTime();
    var time_link = timestamp;
    if (time_now - time_link > link_timelimit) {
     return true;
    }
   }

   var user = FindUser(mixlrlinks, matches[2]);
   if (!user) {
    var user = {name: matches[2], url: matches[1], src: card_src, timestamp: timestamp, total: 0};
    mixlrlinks.push(user);
   }
   user.total++;
  });

  ShowMixlrs();

  if (Number(GetSetting('twd-mixlr-autorefresh'))) {
   $('#mixlr-refresh').hide();
   timers.mixlrs = setTimeout(GetMixlrs, 60000);
  }
  else {
   $('#mixlr-refresh').show();
  }
 });
}

function ShowMixlrs() {
 if (!mixlrlinks.length) {
  $('#mixlrlist-body').text(twd_text_nolinks);
  return;
 }

 var table = $('<table width="100%" />');
 mixlrlinks.sort(SortList);
 var listlength = mixlrlinks.length;
 for (var i = 0; i < listlength; i++) {
  var mixlr = mixlrlinks[i];

  var table_row = $('<tr />');
  var table_td = $('<td />');
  var elem_link = $('<span />');

  elem_link.addClass('mixlrlink');
  elem_link.attr('data-src', mixlr.src);
  elem_link.append($('<span class="mixlrlink-logo" />'));
  elem_link.append($('<span class="mixlrlink-name" />').text(mixlr.name));
  elem_link.append($('<span class="mixlrlink-status" />').text('LIVE'));

  table_td.append(elem_link);
  table_row.append(table_td);

  var table_td = $('<td align="right" />');
  table_td.addClass('mixlrlink-total');
  table_td.append(mixlr.total);
  table_row.append(table_td);

  var table_td = $('<td align="right" />');
  table_td.text(GetTime(mixlr.timestamp));
  table_td.attr('data-timestamp', mixlr.timestamp);
  table_td.addClass('mixlrlink-timestamp');
  table_row.append(table_td);

  var table_td = $('<td align="center" />');
  table_td.addClass('mixlrlink-new');
  if (mixlr.new) {
   table_td.append($('<span />').text('NEW!'));
  }
  else {
   table_td.html('&nbsp;');
  }
  table_row.append(table_td);

  table.append(table_row);
 }
 $('#mixlrlist-body').empty().append(table);

 $('.mixlrlink').click(function () {
  var src = $(this).attr('data-src');
  $('#mixlr-player').remove();
  var elem_mixlr = $('<div />');
  elem_mixlr.attr('id', 'mixlr-player');
  elem_mixlr.addClass('js-tweet-details-fixer tweet-details-fixer');
  elem_mixlr.html('<div class="content"><div class="card2 js-media-container"><div class="js-macaw-cards-iframe-container"><iframe height="215" frameborder="0" scrolling="no" width="100%" src="https://twitter.com' + src + '" style="display: block; margin: 0px; padding: 0px; border: 0px;"></iframe></div></div></div>');
  $('#timeline').parent().prepend(elem_mixlr);
  $('#mixlr-offbtn').show();
 });
}

function ShowMeerkat() {
 var elem_link = $('<a />');

 elem_link.attr('href', 'http://meerkatapp.co/u2');
 elem_link.attr('target', '_blank');
 elem_link.attr('id', 'twd-meerkat-link');
 elem_link.addClass('mrkatlink');
 elem_link.append($('<span class="mrkatlink-logo" />'));
 elem_link.append($('<span class="mrkatlink-name" />').text('U2 on Meerkat'));
 elem_link.append($('<span class="mrkatlink-status" />').text('LIVE'));
 $('#mkatlist').empty().append(elem_link);
}

function CheckMeerkat() {
 var elem_tweets = $('<div />');
 var date_now = new Date();
 var date_str = date_now.getFullYear() + '-' + date_now.getMonth() + '-' + date_now.getDate();
 var search_url = 'https://twitter.com/search?f=tweets&q=live%20now%20meerkat%20from%3Au2%20since%3A' + date_str + '&src=typd';
 var regex = new RegExp('^https?://mrk.tv/[^/]+/?$', 'i');

 elem_tweets.load(search_url + ' .search-stream', function () {
  var elem_item = $(this).find('.stream-item .original-tweet').first();
  var elem_time = $(this).find('._timestamp').first();

  if (elem_time.length) {
   var time_now = (new Date()).getTime();
   var time_link = elem_time.attr('data-time-ms');
   var meerkat_time = GM_getValue('twd-meerkat-time', false);
   if (!meerkat_time || (meerkat_time != time_link && (time_now - time_link) < twd_meerkat_timelimit)) {
    GM_setValue('twd-meerkat-time', time_link);
   }
  }
 });

 timers.mrkat = setTimeout(CheckMeerkat, 5000);
}

function SetupScope() {
 wait(function () {
  var cleanup = Number(GetSetting('twd-scope-cleanup'));
  var elem_header = $('.Header');
  var elem_video = $('.VideoOverlay-container');
  var elem_comments = $('.Comments');
  var elem_hearts = $('#heartsContainer');
  var done = true;

  if (elem_header.length) elem_header.hide();
  else done = false;

  if (elem_video.length) elem_video.find('.BroadcastTitle').hide();
  else done = false;

  if (elem_comments.length) {
   if (cleanup > 1)
    elem_comments.hide();
   else
    elem_comments.show();
  }
  else done = false;

  if (elem_hearts.length) {
   if (cleanup == 1 || cleanup == 3)
    elem_hearts.hide();
   else
    elem_hearts.show();
  }
  else done = false;

  if (done) {
   var elem_side = $('.ProfileSidebar-broadcastsSpacerTop');
   elem_side.attr('style', 'color: #a4b8be; text-align: center; padding-top: 10px;');

   elem_side.empty();
   elem_side.append('<label for="mrkat-hearts"><span class="mrkaticon-heart"></span><input type="checkbox" id="mrkat-hearts" /></label>');
   elem_side.append('<label for="mrkat-comments"><span class="mrkaticon-comments"></span><input type="checkbox" id="mrkat-comments" /></label>');

   var cleanup = GM_getValue('twd-scope-cleanup');
   $('#mrkat-hearts').attr('checked', (cleanup == 0 || cleanup == 2));
   $('#mrkat-comments').attr('checked', (cleanup < 2));
   $('#mrkat-hearts').change(function () {
    if (!$(this).is(':checked'))
     $('#heartsContainer').hide();
    else
     $('#heartsContainer').show();
   });
   $('#mrkat-comments').change(function () {
    if (!$(this).is(':checked'))
     $('.Comments').hide();
    else
     $('.Comments').show();
   });
  }

  return done;
 }, function () {});
}

function WatchScope() {
 if (GM_getValue('twd-settings-saved', 0) == 1) {
  GM_setValue('twd-settings-saved', 0);
  SetupScope();
 }

 var state_text = $('.BroadcastState').text();
 if (/ended/i.test(state_text)) {
  CloseScope();
  return;
 }

 var scopers_offline = GM_getValue('scopers_offline', '');
 var offline_list = scopers_offline.split(',').filter(Boolean);
 var name = $('.ProfileUsername').first().text().replace('@', '');
 var name_index = offline_list.indexOf(name);

 if (name_index != -1) {
  offline_list.splice(name_index, 1);
  scopers_offline = offline_list.join(',');
  GM_setValue('scopers_offline', scopers_offline);
 }

 var meerkat_time = GM_getValue('twd-meerkat-time', false);
 var meerkat_link = $('#twd-meerkat-link');
 if (meerkat_time) {
  if (!meerkat_link && ((new Date()).getTime() - meerkat_time) < twd_meerkat_timelimit) {
   var elem_link = $('<a href="http://meerkatapp.co/u2" target="_blank" id="twd-meerkat-link" class="mrkatlink mrkatlink-live mrkatlink-scope"><span class="mrkatlink-logo"></span><span class="mrkatlink-name">U2 on Meerkat</span><span class="mrkatlink-status">LIVE</span></a>');
   elem_link.click(function () {
    GM_setValue('twd-meerkat-time', false);
    $(this).remove();
   });
   $('body').append(elem_link);
  }
 }
 else if (meerkat_link) {
  meerkat_link.remove();
 }

 timers.scope = setTimeout(WatchScope, 1000);
}

function CloseScope() {
 scopers_offline = GM_getValue('scopers_offline', '');
 var offline_list = scopers_offline.split(',').filter(Boolean);
 var name = $('.ProfileUsername').first().text().replace('@', '');
 var name_index = offline_list.indexOf(name);

 if (name_index == -1) {
  offline_list.push(name);
  scopers_offline = offline_list.join(',');
  GM_setValue('scopers_offline', scopers_offline);
 }
 if (Number(GetSetting('twd-scope-autoclose'))) {
  window.close();
  return;
 }
 $('title').text('* OFFLINE * - ' + name);
}

function SetupKat() {
 wait(function () {
  if ($('.modal-guest-prompt').hasClass('modal-visible') && $('.modals').hasClass('modal-visible')) {
   $('.modal-guest-prompt').removeClass('modal-visible');
   $('.modals').removeClass('modal-visible');
   return true;
  }
  return false;
 }, function () {});
}

function WatchKat() {
 if ($('.stream').hasClass('stream-ended') && Number(GetSetting('twd-meerkat-autoclose'))) {
  window.close();
 }
 timers.mrkat = setTimeout(WatchKat, 1000);
}

function SortList(a, b) {
 if (a.timestamp < b.timestamp)
  return 1;
 if (a.timestamp > b.timestamp)
  return -1;
 return 0;
}

function FindUser(a, n, k) {
 r = false;
 if (!k) k = 'name';
 $.each(a, function (i, o) {
  if (o[k] == n) {
   r = o;
   return false;
  }
 });
 return r;
}

function wait(con, fun, args, timeout) {
 if (typeof con == 'string' ? eval(con) : con()) {
  args = [].slice.call(args || []);
  return fun.apply(this, args);
 }
 timers.wait = setTimeout(function () {
  wait(con, fun, args);
 }, (timeout || 1000));
}