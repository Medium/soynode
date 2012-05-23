// This file was automatically generated from message.soy.
// Please don't edit this file by hand.

if (typeof example == 'undefined') { var example = {}; }
if (typeof example.message == 'undefined') { example.message = {}; }


example.message.hello = function(opt_data) {
  return 'Hello ' + soy.$$escapeHtml(opt_data.name) + ', it is ' + soy.$$escapeHtml(opt_data.date) + '!';
};


example.message.bye = function(opt_data) {
  return 'Goodbye ' + soy.$$escapeHtml(opt_data.name) + ', sorry to see you go.';
};
