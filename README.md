# Connected Pole Application

The connected pole is a tool that can be used by booths in a trade show to analyse its traffic.

## How it works

There are two components in the Connected Pole:
* a camera that takes snapshots of visitors
* a PLC where a number of sensors (temperature, noise level) are connected  
  
The camera uploads snapshots to an FTP server, while the PLC sends telemetry to IoT Hub using the Twin Cat client

In Azure an app monitors the FTP server, fetches images at a given interval and invokes the Face API on cognitive services to get age, gender and if the visitor is smiling.
The result of this operation is forwarded to IoT Hub.

In IoT Hub the events are sent to Stream Analytics which will separate the traffic according to the tenant and multiplex the events, which will go to Power BI live dashboards and also to another Azure Function which will push the telemetry to an mqtt broker for consumption by the Twin Cat mobile app.

<img src="static/diagram.png">

