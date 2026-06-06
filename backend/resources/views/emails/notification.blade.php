<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $title }}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 2px solid #dc2626;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            color: #dc2626;
            margin: 0;
            font-size: 24px;
        }
        .content {
            font-size: 16px;
            color: #555;
        }
        .button {
            display: inline-block;
            background-color: #dc2626;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            margin-top: 20px;
            font-weight: 600;
        }
        .button:hover {
            background-color: #b91c1c;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e5e5;
            font-size: 12px;
            color: #999;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>RescueLink</h1>
        </div>

        <div class="content">
            <h2>{{ $title }}</h2>
            <p>{{ $message }}</p>

            @if($link)
                <a href="{{ config('app.frontend_url') }}{{ $link }}" class="button">View Details</a>
            @endif
        </div>

        <div class="footer">
            <p>This is an automated notification from RescueLink.</p>
            <p>&copy; {{ date('Y') }} RescueLink. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
