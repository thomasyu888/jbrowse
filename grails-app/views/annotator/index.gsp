<!-- The DOCTYPE declaration above will set the     -->
<!-- browser's rendering engine into                -->
<!-- "Standards Mode". Replacing this declaration   -->
<!-- with a "Quirks Mode" doctype is not supported. -->

<%@ page contentType="text/html;charset=UTF-8" %>
<!DOCTYPE html>
<html>
<head>

    <meta name="layout" content="annotator2">
    %{--<meta name="layout" content="main"/>--}%
    <title>Annotator</title>

    <asset:javascript src="spring-websocket"/>

    <script type="text/javascript" language="javascript" src="annotator.nocache.js"></script>
    <script>
        var Options = {
            rootUrl: '${applicationContext.servletContext.getContextPath()}'
            , showFrame: '${params.showFrame  && params.showFrame == 'true' ? 'true' : 'false' }'
            ,userId: '${userKey}'
        };
    </script>
</head>

<body style="background-color: white;">

%{--<div id="annotator" style="background-color: white;"></div>--}%

<!-- RECOMMENDED if your web app will not function without JavaScript enabled -->
<noscript>
    <div style="width: 22em; position: absolute; left: 50%; margin-left: -11em; color: red; background-color: white; border: 1px solid red; padding: 4px; font-family: sans-serif">
        Your web browser must have JavaScript enabled
        in order for this application to display correctly.
    </div>
</noscript>

</body>
</html>
