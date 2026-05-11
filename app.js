// app.js
const { createApp } = Vue;

const mapApp = createApp({
    data() {
        return {
            formData: {
                title: '', legendHeading: '', altText: '', caption: '',
                lat: '-27.470000', lng: '153.020000', zoom: 13
            },
            lookupId: '', lookupError: '',
            icons: [
                { name: "Closed stop", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_cross.png" },
                { name: "Open stop", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_dot_green.png" },
                { name: "Blue", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_dot_blue.png" },
                { name: "Red", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_dot_red.png" },
                { name: "Train", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_small_train.png" },
                { name: "Bus", path: "https://translink.com.au/sites/default/files/assets/images/icons/icon_pin_small_bus.png" }
            ],
            markers: [],
            googleMap: null,
            markerIdCounter: 1,
            
            outputCode: '',

            showModal: false,
            modalData: { lat: 0, lng: 0, title: '', selectedIcon: null },
            tempGoogleMarker: null
        }
    },
    computed: {
        groupedMarkers() {
            const grouped = {};
            this.markers.forEach(m => {
                if (!grouped[m.icon.name]) {
                    grouped[m.icon.name] = { iconPath: m.icon.path, items: [] };
                }
                grouped[m.icon.name].items.push(m);
            });
            return grouped;
        }
    },
    methods: {
        // --- Project Saving & Loading ---
        async exportProject() {
            const projectData = {
                formData: this.formData,
                markers: this.markers.map(m => ({
                    id: m.id, lat: m.lat, lng: m.lng, title: m.title, icon: m.icon
                }))
            };

            const jsonContent = JSON.stringify(projectData, null, 2);
            let fileName = this.formData.title ? this.formData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json' : 'mapbuilder_project.json';

            try {
                if (window.showSaveFilePicker) {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{
                            description: 'MapBuilder Project File',
                            accept: {'application/json': ['.json']},
                        }],
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(jsonContent);
                    await writable.close();
                } else {
                    this.fallbackDownload(jsonContent, fileName);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Save File Picker failed, trying fallback.", err);
                    this.fallbackDownload(jsonContent, fileName);
                }
            }
        },
        fallbackDownload(content, fileName) {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(content);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", fileName);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        },
        triggerImport() {
            document.getElementById('importFile').click();
        },
        importProject(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const projectData = JSON.parse(e.target.result);
                    
                    this.formData = projectData.formData;
                    
                    this.markers.forEach(m => m.googleMarkerObj.setMap(null));
                    this.markers = [];
                    
                    const centerLat = parseFloat(this.formData.lat);
                    const centerLng = parseFloat(this.formData.lng);
                    this.googleMap.setCenter({ lat: centerLat, lng: centerLng });
                    this.googleMap.setZoom(parseInt(this.formData.zoom));

                    let maxId = 0;
                    projectData.markers.forEach(m => {
                        const newGoogleMarker = new google.maps.Marker({
                            position: { lat: parseFloat(m.lat), lng: parseFloat(m.lng) },
                            map: this.googleMap,
                            icon: m.icon.path
                        });
                        
                        this.markers.push({
                            id: m.id,
                            lat: m.lat,
                            lng: m.lng,
                            title: m.title,
                            icon: m.icon,
                            googleMarkerObj: newGoogleMarker
                        });
                        if (m.id > maxId) maxId = m.id;
                    });
                    
                    this.markerIdCounter = maxId + 1;
                    event.target.value = '';
                    this.outputCode = '';

                } catch (error) {
                    alert("Error loading project file. Make sure it is a valid MapBuilder JSON file.");
                }
            };
            reader.readAsText(file);
        },

        // --- Standard Methods ---
        openModal(lat, lng) {
            this.modalData = { lat: lat, lng: lng, title: '', selectedIcon: this.icons[1] };
            this.showModal = true;
        },
        saveModal() {
            if (!this.modalData.title) {
                alert("Please enter a title/description.");
                return;
            }

            if (this.tempGoogleMarker) {
                this.tempGoogleMarker.setMap(null);
                this.tempGoogleMarker = null;
            }

            const newGoogleMarker = new google.maps.Marker({
                position: { lat: this.modalData.lat, lng: this.modalData.lng },
                map: this.googleMap,
                icon: this.modalData.selectedIcon.path
            });

            this.markers.push({
                id: this.markerIdCounter++,
                lat: this.modalData.lat.toFixed(6),
                lng: this.modalData.lng.toFixed(6),
                title: this.modalData.title,
                icon: this.modalData.selectedIcon,
                googleMarkerObj: newGoogleMarker
            });

            this.showModal = false;
        },
        cancelModal() {
            if (this.tempGoogleMarker) {
                this.tempGoogleMarker.setMap(null);
                this.tempGoogleMarker = null;
            }
            this.showModal = false;
        },
        removeMarker(idToRemove) {
            const index = this.markers.findIndex(m => m.id === idToRemove);
            if (index !== -1) {
                this.markers[index].googleMarkerObj.setMap(null);
                this.markers.splice(index, 1);
            }
        },
        lookupStop() {
            this.lookupError = '';
            if (!this.lookupId) return;

            const stop = typeof translinkStops !== 'undefined' ? translinkStops[this.lookupId] : null;

            if (stop) {
                const newLat = parseFloat(stop.lat);
                const newLng = parseFloat(stop.lng);
                
                this.googleMap.setCenter({ lat: newLat, lng: newLng });
                this.googleMap.setZoom(18); 
                
                this.modalData = { lat: newLat, lng: newLng, title: stop.name, selectedIcon: this.icons[1] };

                this.tempGoogleMarker = new google.maps.Marker({
                    position: { lat: newLat, lng: newLng },
                    map: this.googleMap,
                    opacity: 0.5
                });

                this.showModal = true;
            } else {
                this.lookupError = `Stop ID ${this.lookupId} not found in local database.`;
            }
        },
        
        generateOutputs() {
            if (this.markers.length === 0) {
                this.outputCode = "";
                return;
            }

            const uniqueId = Math.floor(Math.random() * 1000000);
            const uniqueMapId = 'map' + uniqueId;
            const legendId = 'maplegend-' + uniqueId;

            const grouped = {};
            this.markers.forEach(m => {
                if (!grouped[m.icon.name]) grouped[m.icon.name] = { name: m.icon.name, icon: m.icon.path, markers: [] };
                grouped[m.icon.name].markers.push({ lat: m.lat, lng: m.lng, title: m.title, description: "" });
            });
            const jsonString = JSON.stringify(Object.values(grouped), null, 2);

            let htmlString = `<div class="row">\n`;
            
            const legendTitle = this.formData.legendHeading ? this.formData.legendHeading : 'Map legend';
            htmlString += `  <div class="panel-group col-xs-12 col-md-12">\n`;
            htmlString += `    <div class="panel-group">\n`;
            htmlString += `      <div class="panel panel-default">\n`;
            htmlString += `        <div class="panel-heading" role="tab">\n`;
            htmlString += `          <h3 class="panel-title"><a href="#${legendId}" class="toggler" data-toggle="collapse" aria-expanded="false" aria-controls="${legendId}">${legendTitle}</a></h3>\n`;
            htmlString += `        </div>\n`;
            htmlString += `        <div class="collapse" id="${legendId}">\n`;
            htmlString += `          <ul class="legendlist">\n`;
            
            for (const [groupName, data] of Object.entries(grouped)) {
                htmlString += `            <li><img class="lazy" src="${data.icon}"> ${groupName}\n`;
                htmlString += `              <ul>\n`;
                data.markers.forEach(item => { 
                    htmlString += `                <li><span class="title">${item.title}</span></li>\n`; 
                });
                htmlString += `              </ul>\n            </li>\n`;
            }
            
            htmlString += `          </ul>\n`;
            htmlString += `        </div>\n`;
            htmlString += `      </div>\n`;
            htmlString += `    </div>\n`;
            htmlString += `  </div>\n`;

            htmlString += `  <div class="col-xs-12 col-md-12">\n`;
            htmlString += `    <figure data-zoom="${this.formData.zoom}" data-set-center="1" data-lat="${this.formData.lat}" data-lng="${this.formData.lng}" data-ratio="16:9" class="mapinsert" data-dynamic="1" data-mapid="${uniqueMapId}" id="${uniqueMapId}">\n`;
            htmlString += `      <div class="mapcontain"></div>\n`;
            htmlString += this.formData.caption ? `      <figcaption>${this.formData.caption}</figcaption>\n` : `      <figcaption></figcaption>\n`;
            htmlString += `    </figure>\n`;
            htmlString += `  </div>\n`;

            htmlString += `  <div id="${uniqueMapId}-markers" class="hidden map-markers-data">\n${jsonString}\n  </div>\n`;
            htmlString += `</div>`;

            this.outputCode = htmlString;
        },

        updateCenterAndZoom() {
            if (this.googleMap) {
                const center = this.googleMap.getCenter();
                this.formData.lat = center.lat().toFixed(6);
                this.formData.lng = center.lng().toFixed(6);
                this.formData.zoom = this.googleMap.getZoom();
            }
        }
    }
});

const vm = mapApp.mount('#app');

function initMap() {
    const mapElement = document.getElementById("map-container");
    const input = document.getElementById("pac-input");
    
    vm.googleMap = new google.maps.Map(mapElement, {
        zoom: vm.formData.zoom,
        center: { lat: parseFloat(vm.formData.lat), lng: parseFloat(vm.formData.lng) },
        mapTypeId: "roadmap",
        streetViewControl: false, 
        mapTypeControl: false
    });

    const searchBox = new google.maps.places.SearchBox(input);

    vm.googleMap.addListener("bounds_changed", () => { searchBox.setBounds(vm.googleMap.getBounds()); });

    searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (places.length == 0) return;
        const bounds = new google.maps.LatLngBounds();
        places.forEach((place) => {
            if (!place.geometry || !place.geometry.location) return;
            if (place.geometry.viewport) bounds.union(place.geometry.viewport);
            else bounds.extend(place.geometry.location);
        });
        vm.googleMap.fitBounds(bounds);
    });

    vm.googleMap.addListener("idle", () => { vm.updateCenterAndZoom(); });

    vm.googleMap.addListener("click", (mapsMouseEvent) => {
        const lat = mapsMouseEvent.latLng.lat();
        const lng = mapsMouseEvent.latLng.lng();

        vm.tempGoogleMarker = new google.maps.Marker({
            position: mapsMouseEvent.latLng,
            map: vm.googleMap,
            opacity: 0.5
        });

        vm.openModal(lat, lng);
    });
}