New payload should look like:
{
    "configs": [
        {
            "hostnames": ["localhost"],
            "type": "",
            "port": 8091
        },
        {
            "hostnames": ["example-sgw-1", "example-sgw-2"],
            "port": 4986,
            "type": "static"
        }
    ],
    "credentials": {
        "username": "admin",
        "password": "password"
    },
    "scheme": "http"
}