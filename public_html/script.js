// Define our global variables
var GoogleMap = null;
var Planes = {};
var PlanesOnMap = 0;
var PlanesOnTable = 0;
var PlanesToReap = 0;
var SelectedPlane = null;
var SpecialSquawk = false;

var iSortCol = -1;
var bSortASC = true;
var bDefaultSortASC = true;
var iDefaultSortCol = 3;

// Get current map settings
CenterLat = Number(localStorage['CenterLat']) || CONST_CENTERLAT;
CenterLon = Number(localStorage['CenterLon']) || CONST_CENTERLON;
ZoomLvl = Number(localStorage['ZoomLvl']) || CONST_ZOOMLVL;

function fetchData() {
    $.getJSON('/dump1090/data.json', function(data) {
        PlanesOnMap = 0
        SpecialSquawk = false;

        // Loop through all the planes in the data packet
        for (var j = 0; j < data.length; j++) {
            // Do we already have this plane object in Planes?
            // If not make it.
            if (Planes[data[j].hex]) {
                var plane = Planes[data[j].hex];
            } else {
                var plane = jQuery.extend(true, {}, planeObject);
            }

            /* For special squawk tests
			if (data[j].hex == '48413x') {
            	data[j].squawk = '7700';
            } //*/

            // Set SpecialSquawk-value
            if (data[j].squawk == '7500' || data[j].squawk == '7600' || data[j].squawk == '7700') {
                SpecialSquawk = true;
            }

            // Call the function update
            plane.funcUpdateData(data[j]);

            // Copy the plane into Planes
            Planes[plane.icao] = plane;
        }

        PlanesOnTable = data.length;
    });
}

// Initalizes the map and starts up our timers to call various functions
function initialize() {
    // Make a list of all the available map IDs
    var mapTypeIds = [];
    for (var type in google.maps.MapTypeId) {
        mapTypeIds.push(google.maps.MapTypeId[type]);
    }
    // Push OSM on to the end
    mapTypeIds.push("OSM");
    mapTypeIds.push("dark_map");

    // Styled Map to outline airports and highways
    var styles = [{
        "featureType": "administrative",
        "stylers": [{
            "visibility": "off"
        }]
    }, {
        "featureType": "landscape",
        "stylers": [{
            "visibility": "off"
        }]
    }, {
        "featureType": "poi",
        "stylers": [{
            "visibility": "off"
        }]
    }, {
        "featureType": "road",
        "stylers": [{
            "visibility": "off"
        }]
    }, {
        "featureType": "transit",
        "stylers": [{
            "visibility": "off"
        }]
    }, {
        "featureType": "landscape",
        "stylers": [{
            "visibility": "on"
        }, {
            "weight": 8
        }, {
            "color": "#000000"
        }]
    }, {
        "featureType": "water",
        "stylers": [{
            "lightness": -74
        }]
    }, {
        "featureType": "transit.station.airport",
        "stylers": [{
            "visibility": "on"
        }, {
            "weight": 8
        }, {
            "invert_lightness": true
        }, {
            "lightness": 27
        }]
    }, {
        "featureType": "road.highway",
        "stylers": [{
            "visibility": "simplified"
        }, {
            "invert_lightness": true
        }, {
            "gamma": 0.3
        }]
    }, {
        "featureType": "road",
        "elementType": "labels",
        "stylers": [{
            "visibility": "off"
        }]
    }]

    // Add our styled map
    var styledMap = new google.maps.StyledMapType(styles, {
        name: "Dark Map"
    });

    // Define the Google Map
    var mapOptions = {
        center: new google.maps.LatLng(CenterLat, CenterLon),
        zoom: ZoomLvl,
        mapTypeId: google.maps.MapTypeId.HYBRID,
        mapTypeControl: true,
        streetViewControl: false,
        mapTypeControlOptions: {
            mapTypeIds: mapTypeIds,
            position: google.maps.ControlPosition.TOP_LEFT,
            style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
        }
    };

    GoogleMap = new google.maps.Map(document.getElementById("map_canvas"), mapOptions);

    //Define OSM map type pointing at the OpenStreetMap tile server
    GoogleMap.mapTypes.set("OSM", new google.maps.ImageMapType({
        getTileUrl: function(coord, zoom) {
            return "http://tile.openstreetmap.org/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
        },
        tileSize: new google.maps.Size(256, 256),
        name: "OpenStreetMap",
        maxZoom: 18
    }));

    GoogleMap.mapTypes.set("dark_map", styledMap);

    // Listeners for newly created Map
    google.maps.event.addListener(GoogleMap, 'center_changed', function() {
        localStorage['CenterLat'] = GoogleMap.getCenter().lat();
        localStorage['CenterLon'] = GoogleMap.getCenter().lng();
    });

    google.maps.event.addListener(GoogleMap, 'zoom_changed', function() {
        localStorage['ZoomLvl'] = GoogleMap.getZoom();
    });

    // Add home marker if requested
    if (SiteShow && (typeof SiteLat !== 'undefined' || typeof SiteLon !== 'undefined')) {
        var siteMarker = new google.maps.LatLng(SiteLat, SiteLon);
        var markerImage = new google.maps.MarkerImage(
            'http://maps.google.com/mapfiles/kml/pal4/icon57.png',
            new google.maps.Size(32, 32), // Image size
            new google.maps.Point(0, 0), // Origin point of image
            new google.maps.Point(16, 16)); // Position where marker should point 
        var marker = new google.maps.Marker({
            position: siteMarker,
            map: GoogleMap,
            icon: markerImage,
            title: 'SPAD7',
            zIndex: -99999
        });

        if (SiteCircles) {
            for (var i = 0; i < SiteCirclesDistances.length; i++) {
                drawCircle(marker, SiteCirclesDistances[i]); // in meters
            }
        }
    }

    // These will run after page is complitely loaded
    $(window).load(function() {
        $('#dialog-modal').css('display', 'inline'); // Show hidden settings-windows content
    });

    // Load up our options page
    optionsInitalize();

    // Did our crafty user need some setup?
    extendedInitalize();

    refreshSelected();
    // Setup our timer to poll from the server.
    window.setInterval(function() {
        fetchData();
        refreshTableInfo();
        refreshSelected();
        reaper();
        extendedPulse();
    }, 1000);
}

// This looks for planes to reap out of the master Planes variable
function reaper() {
    PlanesToReap = 0;
    // When did the reaper start?
    reaptime = new Date().getTime();
    // Loop the planes
    for (var reap in Planes) {
        // Is this plane possibly reapable?
        if (Planes[reap].reapable == true) {
            // Has it not been seen for 5 minutes?
            // This way we still have it if it returns before then
            // Due to loss of signal or other reasons
            if ((reaptime - Planes[reap].updated) > 300000) {
                // Reap it.
                delete Planes[reap];
            }
            PlanesToReap++;
        }
    };
}

// Refresh the detail window about the plane
function refreshSelected() {
    var selected = false;
    if (typeof SelectedPlane !== 'undefined' && SelectedPlane != "ICAO" && SelectedPlane != null) {
        selected = Planes[SelectedPlane];
    }

    var html = '';
    var html2 = '';

    // Flight header line including squawk if needed
    if (selected && selected.flight == "") {
        html += '<h4><span class="label label-info">N/A (' + selected.icao + ')</span></h4>';
    } else if (selected && selected.flight != "") {
        html += '<h4><span class="label label-success">' + selected.flight + '</span></h4>';
    } else {
        html += '<h4><span class="label label-default">DUMP1090</span></h4>';
    }

    if (selected && selected.squawk == 7500) { // Lets hope we never see this... Aircraft Hijacking
        html += '<h3><span class="label label-danger">&nbsp;Squawking: Aircraft Hijacking&nbsp;</span></h3>';
    } else if (selected && selected.squawk == 7600) { // Radio Failure
        html += '<h3><span class="label label-warning">&nbsp;Squawking: Radio Failure&nbsp;</span></h3>';
    } else if (selected && selected.squawk == 7700) { // General Emergency
        html += '<h3><span class="label label-warning">&nbsp;Squawking: General Emergency&nbsp;</span></h3>';
    } else if (selected && selected.flight != '') {
        html2 += '<a class="btn btn-primary" href="http://fr24.com/' + selected.flight + '" target="_blank">FR24</a>';
        html2 += '&nbsp;<a class="btn btn-primary" href="http://www.flightstats.com/go/FlightStatus/flightStatusByFlight.do?';
        html2 += 'flightNumber=' + selected.flight + '" target="_blank">FlightStats</a>';
        html2 += '&nbsp;<a class="btn btn-primary" href="http://flightaware.com/live/flight/' + selected.flight + '" target="_blank">FlightAware</a>';
    }
    html += '<table class="table table-bordered">';

    if (selected) {
        if (Metric) {
            html += '<tr><td>Altitude: </td><td>' + Math.round(selected.altitude / 3.2828) + ' m</td></tr>';
        } else {
            html += '<tr><td>Altitude: </td><td>' + selected.altitude + ' ft</td></tr>';
        }
    } else {
        html += '<tr><td>Altitude: </td><td>n/a</td></tr>';
    }

    if (selected && selected.squawk != '0000') {
        html += '<tr><td>Squawk: </td><td>' + selected.squawk + '</td></tr>';
    } else {
        html += '<tr><td>Squawk: </td><td>n/a</td></tr>';
    }

    html += '<tr><td>Speed: </td><td>'
    if (selected) {
        if (Metric) {
            html += Math.round(selected.speed * 1.852) + ' km/h';
        } else {
            html += selected.speed + ' kt';
        }
    } else {
        html += 'n/a';
    }
    html += '</td></tr>';

    if (selected) {
        html += '<tr><td>ICAO (hex): </td><td>' + selected.icao + '</td></tr>';
    } else {
        html += '<tr><td>ICAO (hex): </td><td>n/a</td></tr>'; // Something is wrong if we are here
    }

    html += '<tr><td>Track: </td><td>'
    if (selected && selected.vTrack) {
        html += selected.track + '&deg;' + ' (' + normalizeTrack(selected.track, selected.vTrack)[1] + ')';
    } else {
        html += 'n/a';
    }
    html += '</td></tr>';

    html += '<tr><td colspan="2">Lat/Long: </td></tr><tr><td colspan="2">';
    if (selected && selected.vPosition) {

        html += selected.latitude + ', ' + selected.longitude + '</td></tr>';

        // Let's show some extra data if we have site coordinates
        if (SiteShow) {
            var siteLatLon = new google.maps.LatLng(SiteLat, SiteLon);
            var planeLatLon = new google.maps.LatLng(selected.latitude, selected.longitude);
            var dist = google.maps.geometry.spherical.computeDistanceBetween(siteLatLon, planeLatLon);

            if (Metric) {
                dist /= 1000;
            } else {
                dist /= 1852;
            }
            dist = (Math.round((dist) * 10) / 10).toFixed(1);
            html += '<tr><td colspan="2">Distance from Site: </td></tr><tr><td colspan="2">' + dist +
                (Metric ? ' km' : ' NM') + '</td></tr>';
        } // End of SiteShow
    } else {
        html += 'n/a</td></tr>';
        if (SiteShow) {
            html += '<tr><td colspan="2">Distance from Site: </td></tr><tr><td colspan="2">n/a ' +
                (Metric ? ' km' : ' NM') + '</td></tr>';
        } else {
            html += 'n/a</td></tr>';
        }
    }

    html += '</table>';

    document.getElementById('plane_detail').innerHTML = html;
    document.getElementById('plane_extension').innerHTML = html2;
}

// Right now we have no means to validate the speed is good
// Want to return (n/a) when we dont have it
// TODO: Edit C code to add a valid speed flag
// TODO: Edit js code to use said flag
function normalizeSpeed(speed, valid) {
    return speed
}

// Returns back a long string, short string, and the track if we have a vaild track path
function normalizeTrack(track, valid) {
    x = []
    if ((track > -1) && (track < 22.5)) {
        x = ["North", "N", track]
    }
    if ((track > 22.5) && (track < 67.5)) {
        x = ["North East", "NE", track]
    }
    if ((track > 67.5) && (track < 112.5)) {
        x = ["East", "E", track]
    }
    if ((track > 112.5) && (track < 157.5)) {
        x = ["South East", "SE", track]
    }
    if ((track > 157.5) && (track < 202.5)) {
        x = ["South", "S", track]
    }
    if ((track > 202.5) && (track < 247.5)) {
        x = ["South West", "SW", track]
    }
    if ((track > 247.5) && (track < 292.5)) {
        x = ["West", "W", track]
    }
    if ((track > 292.5) && (track < 337.5)) {
        x = ["North West", "NW", track]
    }
    if ((track > 337.5) && (track < 361)) {
        x = ["North", "N", track]
    }
    if (!valid) {
        x = [" ", "n/a", ""]
    }
    return x
}

// Refeshes the larger table of all the planes
function refreshTableInfo() {
    var stalePlanes = false;
    for (var tablep in Planes) {
        var tableplane = Planes[tablep]
        if (!tableplane.reapable) {
            if (tableplane.seen > 15) {
               stalePlanes = true;
	    }
        }
    }
    var html = '<div class="row">';
    html += '<div class="col-lg-12"><h3><span class="label label-primary">Active</span></h3></div>';
    for (var tablep in Planes) {
        var tableplane = Planes[tablep]
        if (!tableplane.reapable) {
            var specialStyle = " btn-primary";
            // Is this the plane we selected?
            
            if (tableplane.icao == SelectedPlane) {
                specialStyle = " btn-success selected";
            }
            // Lets hope we never see this... Aircraft Hijacking
            if (tableplane.squawk == 7500) {
                specialStyle = " btn-danger squawk7500";
            }
            // Radio Failure
            if (tableplane.squawk == 7600) {
                specialStyle = " btn-warning squawk7600";
            }
            // Emergancy
            if (tableplane.squawk == 7700) {
                specialStyle = " btn-warning squawk7700";
            }
            
            if (tableplane.flight != '' && tableplane.seen < 15) {
                html += '<div class="col-sm-12 col-md-12 col-lg-12 col-xl-6 flightcenter"><button class="btn' + specialStyle + ' btn-block" ICAO="' + tableplane.icao + '">';        
                html += 'FLT ' + tableplane.flight + '';
                html += '</button></div>';
            } else if (tableplane.flight == '' && tableplane.seen < 15) {
                html += '<div class="col-sm-12 col-md-12 col-lg-12 col-xl-6 flightcenter"><button class="btn' + specialStyle + ' btn-block" ICAO="' + tableplane.icao + '">';    
                html += 'N/A (' + tableplane.icao.toUpperCase() + ')';
                html += '</button></div>';
            }
        }
    }
    html += '</div>';
    if (stalePlanes == true) {
    html += '<div class="row">';
    html += '<div class="col-lg-12"><h3><span class="label label-default">Stale</span></h3></div>';
    for (var tablep in Planes) {
        var tableplane = Planes[tablep]
        if (!tableplane.reapable) {
            var specialStyle = " btn-default";
            // Is this the plane we selected?
            
            if (tableplane.icao == SelectedPlane) {
                specialStyle = " btn-success selected";
            }
            // Lets hope we never see this... Aircraft Hijacking
            if (tableplane.squawk == 7500) {
                specialStyle = " btn-danger squawk7500";
            }
            // Radio Failure
            if (tableplane.squawk == 7600) {
                specialStyle = " btn-warning squawk7600";
            }
            // Emergancy
            if (tableplane.squawk == 7700) {
                specialStyle = " btn-warning squawk7700";
            }

            if (tableplane.flight != '' && tableplane.seen > 15) {
	        html += '<div class="col-sm-12 col-md-12 col-lg-12 col-xl-6 flightcenter"><button class="btn' + specialStyle + ' btn-block" ICAO="' + tableplane.icao + '">';
                html += 'FLT ' + tableplane.flight + '';
                html += '</button></div>';
            } else if (tableplane.flight == '' && tableplane.seen > 15) {
                html += '<div class="col-sm-12 col-md-12 col-lg-12 col-xl-6 flightcenter"><button class="btn' + specialStyle + ' btn-block" ICAO="' + tableplane.icao + '">';
                html += 'N/A (' + tableplane.icao.toUpperCase() + ')';
                html += '</button></div>';
            }
        }
    }
    html += '</div>';
    }

    document.getElementById('planes_table').innerHTML = html;

    if (SpecialSquawk) {
        $('#SpecialSquawkWarning').css('display', 'inline');
    } else {
        $('#SpecialSquawkWarning').css('display', 'none');
    }

    // Click event for table
    $('#planes_table').find('button').click(function() {
        var hex = $(this).attr('ICAO');
        if (hex != "ICAO") {
            selectPlaneByHex(hex);
            refreshTableInfo();
            refreshSelected();
        }
    });

    //sortTable("tableinfo");
}

// Credit goes to a co-worker that needed a similar functions for something else
// we get a copy of it free ;)
function setASC_DESC(iCol) {
    if (iSortCol == iCol) {
        bSortASC = !bSortASC;
    } else {
        bSortASC = bDefaultSortASC;
    }
}

function sortTable(szTableID, iCol) {
    //if iCol was not provided, and iSortCol is not set, assign default value
    if (typeof iCol === 'undefined') {
        if (iSortCol != -1) {
            var iCol = iSortCol;
        } else if (SiteShow && (typeof SiteLat !== 'undefined' || typeof SiteLon !== 'undefined')) {
            var iCol = 5;
        } else {
            var iCol = iDefaultSortCol;
        }
    }

    //retrieve passed table element
    var oTbl = document.getElementById(szTableID).tBodies[0];
    var aStore = [];

    //If supplied col # is greater than the actual number of cols, set sel col = to last col
    if (typeof oTbl.rows[0] !== 'undefined' && oTbl.rows[0].cells.length <= iCol) {
        iCol = (oTbl.rows[0].cells.length - 1);
    }

    //store the col #
    iSortCol = iCol;

    //determine if we are delaing with numerical, or alphanumeric content
    var bNumeric = false;
    if ((typeof oTbl.rows[0] !== 'undefined') &&
        (!isNaN(parseFloat(oTbl.rows[0].cells[iSortCol].textContent ||
            oTbl.rows[0].cells[iSortCol].innerText)))) {
        bNumeric = true;
    }

    //loop through the rows, storing each one inro aStore
    for (var i = 0, iLen = oTbl.rows.length; i < iLen; i++) {
        var oRow = oTbl.rows[i];
        vColData = bNumeric ? parseFloat(oRow.cells[iSortCol].textContent || oRow.cells[iSortCol].innerText) : String(oRow.cells[iSortCol].textContent || oRow.cells[iSortCol].innerText);
        aStore.push([vColData, oRow]);
    }

    //sort aStore ASC/DESC based on value of bSortASC
    if (bNumeric) { //numerical sort
        aStore.sort(function(x, y) {
            return bSortASC ? x[0] - y[0] : y[0] - x[0];
        });
    } else { //alpha sort
        aStore.sort();
        if (!bSortASC) {
            aStore.reverse();
        }
    }

    //rewrite the table rows to the passed table element
    for (var i = 0, iLen = aStore.length; i < iLen; i++) {
        oTbl.appendChild(aStore[i][1]);
    }
    aStore = null;
}

function selectPlaneByHex(hex) {
    // If SelectedPlane has something in it, clear out the selected
    if (SelectedPlane != null) {
        Planes[SelectedPlane].is_selected = false;
        Planes[SelectedPlane].funcClearLine();
        Planes[SelectedPlane].markerColor = MarkerColor;
        // If the selected has a marker, make it not stand out
        if (Planes[SelectedPlane].marker) {
            Planes[SelectedPlane].marker.setIcon(Planes[SelectedPlane].funcGetIcon());
        }
    }

    // If we are clicking the same plane, we are deselected it.
    if (String(SelectedPlane) != String(hex)) {
        // Assign the new selected
        SelectedPlane = hex;
        Planes[SelectedPlane].is_selected = true;
        // If the selected has a marker, make it stand out
        if (Planes[SelectedPlane].marker) {
            Planes[SelectedPlane].funcUpdateLines();
            Planes[SelectedPlane].marker.setIcon(Planes[SelectedPlane].funcGetIcon());
        }
    } else {
        SelectedPlane = null;
    }
    refreshSelected();
    refreshTableInfo();
}

function resetMap() {
    // Reset localStorage values
    localStorage['CenterLat'] = CONST_CENTERLAT;
    localStorage['CenterLon'] = CONST_CENTERLON;
    localStorage['ZoomLvl'] = CONST_ZOOMLVL;

    // Try to read values from localStorage else use CONST_s
    CenterLat = Number(localStorage['CenterLat']) || CONST_CENTERLAT;
    CenterLon = Number(localStorage['CenterLon']) || CONST_CENTERLON;
    ZoomLvl = Number(localStorage['ZoomLvl']) || CONST_ZOOMLVL;

    // Set and refresh
    GoogleMap.setZoom(parseInt(ZoomLvl));
    GoogleMap.setCenter(new google.maps.LatLng(parseFloat(CenterLat), parseFloat(CenterLon)));
    GoogleMap.setMapTypeId(google.maps.MapTypeId.HYBRID);
    if (SelectedPlane) {
        selectPlaneByHex(SelectedPlane);
    }

    refreshSelected();
    refreshTableInfo();
}

function drawCircle(marker, distance) {
    if (typeof distance === 'undefined') {
        return false;

        if (!(!isNaN(parseFloat(distance)) && isFinite(distance)) || distance < 0) {
            return false;
        }
    }

    distance *= 1000.0;
    if (!Metric) {
        distance *= 1.852;
    }

    // Add circle overlay and bind to marker
    var circle = new google.maps.Circle({
        map: GoogleMap,
        radius: distance, // In meters
        fillOpacity: 0.0,
        strokeWeight: 1,
        strokeOpacity: 0.3
    });
    circle.bindTo('center', marker, 'position');
}
