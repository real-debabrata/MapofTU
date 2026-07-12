/**
 * Tripura University Interactive Campus Map - Data Handler Core
 */
(function() {
    'use strict';

    const CampusDataLoader = {
        // Fallback production-ready schema representations
        fallbackBuildings: [
            {
                "id": 101,
                "name": "Administrative Block",
                "buildingNumber": "B-01",
                "floors": 2,
                "coordinates": [23.7570, 91.2595],
                "category": "administration",
                "departments": ["General Administration", "Finance Office", "Academic Section"],
                "image": "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=80",
                "description": "The administrative headquarters of Tripura University housing leadership and operational units.",
                "openingHours": "10:00 AM - 05:30 PM",
                "accessibility": "Wheelchair Ramps, Ground-level entrance, Lift available",
                "emergencyContact": "+91-381-2374801",
                "website": "https://www.tripurauniv.ac.in",
                "floorCount": 2,
                "liftAvailability": true,
                "staircaseLocations": ["North Wing", "Central Atrium"],
                "washroomLocations": ["GF West Wing", "1F East Wing"],
                "emergencyExits": ["South Gate", "North Wing Fire Escape"]
            },
            {
                "id": 102,
                "name": "Central Library",
                "buildingNumber": "B-03",
                "floors": 3,
                "coordinates": [23.7585, 91.2612],
                "category": "amenities",
                "departments": ["Library & Information Science"],
                "image": "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=600&q=80",
                "description": "Multi-storey knowledge center with a vast collection of resources and comfortable reading areas.",
                "openingHours": "09:00 AM - 08:00 PM",
                "accessibility": "Elevator, Braille signage, Low counters",
                "emergencyContact": "+91-381-2374803",
                "website": "https://www.tripurauniv.ac.in/library",
                "floorCount": 3,
                "liftAvailability": true,
                "staircaseLocations": ["Main Entrance Hall", "South Wing"],
                "washroomLocations": ["GF Entrance Lobby", "1F North Corner", "2F South Corner"],
                "emergencyExits": ["Main Entrance", "Emergency West Door"]
            },
            {
                "id": 103,
                "name": "Academic Building 11 (Science Block)",
                "buildingNumber": "B-11",
                "floors": 4,
                "coordinates": [23.7605, 91.2625],
                "category": "academic",
                "departments": ["Computer Science & Engineering", "Information Technology", "Mathematics", "Physics"],
                "image": "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=600&q=80",
                "description": "State-of-the-art classroom and laboratory block housing STEM programs and computational centers.",
                "openingHours": "09:30 AM - 05:30 PM",
                "accessibility": "Ramp access, Elevators, Wide corridor layouts",
                "emergencyContact": "+91-381-2374811",
                "website": "https://www.tripurauniv.ac.in/cs",
                "floorCount": 4,
                "liftAvailability": true,
                "staircaseLocations": ["East Entrance", "West Corner Wing"],
                "washroomLocations": ["GF, 1F, 2F, 3F beside main stairs"],
                "emergencyExits": ["East Wing Main Exit", "West Fire Escape stairs"]
            },
            {
                "id": 104,
                "name": "Health Centre",
                "buildingNumber": "B-05",
                "floors": 1,
                "coordinates": [23.7580, 91.2600],
                "category": "emergency",
                "departments": ["Primary Care", "Pharmacy"],
                "image": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80",
                "description": "On-campus medical facility offering initial medical consultation, diagnosis and health management.",
                "openingHours": "24/7 (Emergency Service)",
                "accessibility": "Fully wheelchair ramp compatible, level corridors",
                "emergencyContact": "+91-381-2374899",
                "website": "https://www.tripurauniv.ac.in/health",
                "floorCount": 1,
                "liftAvailability": false,
                "staircaseLocations": ["Not Applicable (Ground Floor Only)"],
                "washroomLocations": ["GF Main Corridor"],
                "emergencyExits": ["Main Front Door", "Rear Ambulance Bay Door"]
            }
        ],

        fallbackRooms: [
            { "id": 501, "buildingId": 103, "floor": 0, "room": "G-01", "name": "Computational Theory Lab", "type": "Laboratory", "capacity": 60 },
            { "id": 502, "buildingId": 103, "floor": 1, "room": "102", "name": "M.Sc CS Classroom", "type": "Classroom", "capacity": 45 },
            { "id": 503, "buildingId": 103, "floor": 2, "room": "203", "name": "Advanced IoT Research Wing", "type": "Laboratory", "capacity": 30 },
            { "id": 504, "buildingId": 103, "floor": 3, "room": "301", "name": "CSE Department Head Office", "type": "Office", "capacity": 10 },
            { "id": 505, "buildingId": 102, "floor": 0, "room": "L-GF", "name": "Main Reference Section", "type": "Library Wing", "capacity": 150 },
            { "id": 506, "buildingId": 102, "floor": 1, "room": "L-1F", "name": "Digital Resource Lab", "type": "Laboratory", "capacity": 80 },
            { "id": 507, "buildingId": 101, "floor": 1, "room": "A-108", "name": "Vice Chancellor Secretariat", "type": "Office", "capacity": 15 }
        ],

        fallbackRoads: {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": { "name": "University Main Highway Avenue", "type": "primary" },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [91.2588, 23.7548],
                            [91.2595, 23.7570],
                            [91.2612, 23.7585],
                            [91.2625, 23.7605]
                        ]
                    }
                },
                {
                    "type": "Feature",
                    "properties": { "name": "Science Block Link Pathway", "type": "pathway" },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [91.2612, 23.7585],
                            [91.2600, 23.7580],
                            [91.2625, 23.7605]
                        ]
                    }
                }
            ]
        },

        async loadBuildings() {
            try {
                const response = await fetch('data/buildings.json');
                if (!response.ok) throw new Error('Data fetch issue');
                return await response.json();
            } catch (e) {
                console.warn("Utilizing precompiled buildings dictionary fallback:", e);
                return this.fallbackBuildings;
            }
        },

        async loadRooms() {
            try {
                const response = await fetch('data/rooms.json');
                if (!response.ok) throw new Error('Data fetch issue');
                return await response.json();
            } catch (e) {
                console.warn("Utilizing precompiled rooms dictionary fallback:", e);
                return this.fallbackRooms;
            }
        },

        async loadRoads() {
            try {
                const response = await fetch('data/roads.geojson');
                if (!response.ok) throw new Error('Data fetch issue');
                return await response.json();
            } catch (e) {
                console.warn("Utilizing precompiled roads GeoJSON fallback:", e);
                return this.fallbackRoads;
            }
        }
    };

    window.CampusMap = window.CampusMap || {};
    window.CampusMap.DataLoader = CampusDataLoader;
})();