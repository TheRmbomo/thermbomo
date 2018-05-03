var socket = io();

socket.on('connect', () => {
});

socket.on('disconnect', () => {
});

$('#login').on('submit', event => {
  event.preventDefault();
  var authInfo = JSON.stringify({
    email: $('[name=email]').val(),
    password: $('[name=password]').val()
  });

  $.ajax({
    url: "/login",
    type: "POST",
    dataType: "json",
    data: authInfo,
    contentType: "application/json; charset=UTF-8",
    timeout: 5000
  })
  .done((res, status, xhr) => {
    // console.log(res);
    var token = xhr.getResponseHeader('x-auth');
    console.log(token);
    document.cookie = 'x-auth=' + token;
    $(location).attr("href", "/");
  })
  .fail(e => console.log(e.responseText));
});
